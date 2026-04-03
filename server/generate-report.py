#!/usr/bin/env python3
"""
ERP Vendor Evaluation PDF Report Generator
Avero Caliber branding: Navy (#1a2744) + Gold (#d4a853)
"""

import sys
import json
import urllib.request
from pathlib import Path
from datetime import datetime

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus.flowables import Flowable

# ==================== COLORS ====================
NAVY = HexColor("#1a2744")
GOLD = HexColor("#d4a853")
LIGHT_NAVY = HexColor("#253560")
LIGHT_GOLD = HexColor("#f5e6c8")
BG_LIGHT = HexColor("#f8f9fc")
GRAY_LIGHT = HexColor("#e8eaf0")
GRAY_MED = HexColor("#9ca3b0")
GRAY_DARK = HexColor("#4a5568")
TEXT_DARK = HexColor("#1a2030")

SCORE_GREEN = HexColor("#22c55e")
SCORE_GOLD = HexColor("#d4a853")
SCORE_RED = HexColor("#ef4444")
SCORE_GREEN_BG = HexColor("#f0fdf4")
SCORE_GOLD_BG = HexColor("#fffbeb")
SCORE_RED_BG = HexColor("#fef2f2")

PAGE_W, PAGE_H = letter
MARGIN = 0.75 * inch
CONTENT_W = PAGE_W - 2 * MARGIN

# ==================== FONTS ====================
FONT_DIR = Path("/tmp/fonts")
FONT_DIR.mkdir(exist_ok=True)

FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"

def setup_fonts():
    """Download and register DM Sans; fall back to Helvetica on failure."""
    global FONT_REGULAR, FONT_BOLD
    try:
        font_url = "https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf"
        font_path = FONT_DIR / "DMSans.ttf"
        if not font_path.exists():
            req = urllib.request.Request(font_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                font_path.write_bytes(resp.read())
        pdfmetrics.registerFont(TTFont("DMSans", str(font_path)))
        # Use the same variable font for bold — fall back gracefully
        pdfmetrics.registerFont(TTFont("DMSans-Bold", str(font_path)))
        pdfmetrics.registerFontFamily("DMSans", normal="DMSans", bold="DMSans-Bold",
                                      italic="DMSans", boldItalic="DMSans-Bold")
        FONT_REGULAR = "DMSans"
        FONT_BOLD = "DMSans-Bold"
    except Exception as e:
        print(f"[WARN] Could not load DM Sans ({e}), using Helvetica", file=sys.stderr)
        FONT_REGULAR = "Helvetica"
        FONT_BOLD = "Helvetica-Bold"

# ==================== HELPER: SCORE COLOR ====================
def score_color(score: float):
    """Return (text_color, bg_color) based on percentage score 0-100."""
    if score >= 80:
        return SCORE_GREEN, SCORE_GREEN_BG
    elif score >= 60:
        return SCORE_GOLD, SCORE_GOLD_BG
    else:
        return SCORE_RED, SCORE_RED_BG

def score_letter_color(letter: str):
    """Return color for S/F/C/T/N score letters."""
    return {
        "S": SCORE_GREEN,
        "F": HexColor("#3b82f6"),
        "C": SCORE_GOLD,
        "T": HexColor("#f97316"),
        "N": SCORE_RED,
    }.get(letter, GRAY_DARK)

# ==================== CUSTOM FLOWABLES ====================
class ColorBar(Flowable):
    """A colored horizontal bar, used for vendor accent bars."""
    def __init__(self, color, height=4, width=None):
        super().__init__()
        self.bar_color = color
        self.bar_height = height
        self._width = width

    def wrap(self, available_width, available_height):
        w = self._width if self._width else available_width
        self.width = w
        self.height = self.bar_height
        return self.width, self.height

    def draw(self):
        self.canv.setFillColor(self.bar_color)
        self.canv.rect(0, 0, self.width, self.bar_height, fill=1, stroke=0)


# ==================== HEADER / FOOTER ====================
def make_header_footer(project_name: str, total_pages_placeholder=None):
    def draw_hf(canvas, doc):
        canvas.saveState()
        page_num = doc.page

        # Gold line under header
        header_y = PAGE_H - MARGIN + 4
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(1.5)
        canvas.line(MARGIN, header_y - 14, PAGE_W - MARGIN, header_y - 14)

        # Header text
        canvas.setFont(FONT_BOLD, 8)
        canvas.setFillColor(NAVY)
        canvas.drawString(MARGIN, header_y - 10, "Avero Caliber")
        canvas.setFont(FONT_REGULAR, 8)
        canvas.setFillColor(GRAY_DARK)
        canvas.drawRightString(PAGE_W - MARGIN, header_y - 10, project_name)

        # Footer line
        footer_y = MARGIN - 10
        canvas.setStrokeColor(GRAY_LIGHT)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, footer_y + 14, PAGE_W - MARGIN, footer_y + 14)

        # Page number center
        canvas.setFont(FONT_REGULAR, 8)
        canvas.setFillColor(GRAY_DARK)
        canvas.drawCentredString(PAGE_W / 2, footer_y, f"Page {page_num}")

        # CONFIDENTIAL right
        canvas.setFont(FONT_BOLD, 7)
        canvas.setFillColor(NAVY)
        canvas.drawRightString(PAGE_W - MARGIN, footer_y, "CONFIDENTIAL")

        canvas.restoreState()
    return draw_hf


# ==================== STYLES ====================
def build_styles():
    styles = getSampleStyleSheet()

    def S(name, parent_name="Normal", **kwargs):
        base = styles.get(parent_name, styles["Normal"])
        kwargs.setdefault("fontName", FONT_REGULAR)
        kwargs.setdefault("fontSize", 10)
        kwargs.setdefault("leading", 14)
        kwargs.setdefault("textColor", TEXT_DARK)
        return ParagraphStyle(name, parent=base, **kwargs)

    return {
        "cover_title": S("cover_title", fontSize=32, leading=38, fontName=FONT_BOLD,
                         textColor=NAVY, spaceAfter=8),
        "cover_subtitle": S("cover_subtitle", fontSize=16, leading=20, textColor=NAVY,
                            spaceAfter=4),
        "cover_meta": S("cover_meta", fontSize=11, leading=16, textColor=GRAY_DARK,
                        spaceAfter=4),
        "section_header": S("section_header", fontSize=18, leading=22, fontName=FONT_BOLD,
                            textColor=NAVY, spaceBefore=4, spaceAfter=12),
        "subsection_header": S("subsection_header", fontSize=13, leading=17,
                               fontName=FONT_BOLD, textColor=NAVY, spaceBefore=8, spaceAfter=6),
        "body": S("body", fontSize=9.5, leading=14, spaceAfter=6),
        "body_small": S("body_small", fontSize=8.5, leading=12, textColor=GRAY_DARK,
                        spaceAfter=4),
        "summary_text": S("summary_text", fontSize=10, leading=15, spaceAfter=8,
                          textColor=GRAY_DARK),
        "bullet": S("bullet", fontSize=9.5, leading=14, leftIndent=12,
                    bulletIndent=0, spaceAfter=3),
        "table_header": S("table_header", fontSize=8.5, fontName=FONT_BOLD,
                          textColor=white, leading=11),
        "table_cell": S("table_cell", fontSize=8.5, leading=11, textColor=TEXT_DARK),
        "table_cell_center": S("table_cell_center", fontSize=8.5, leading=11,
                               textColor=TEXT_DARK, alignment=TA_CENTER),
        "category_row": S("category_row", fontSize=8.5, fontName=FONT_BOLD,
                          textColor=white, leading=11),
        "score_cell": S("score_cell", fontSize=9, fontName=FONT_BOLD, leading=12,
                        alignment=TA_CENTER),
        "methodology_body": S("methodology_body", fontSize=9, leading=14,
                              textColor=GRAY_DARK, spaceAfter=4),
        "footer_note": S("footer_note", fontSize=8, leading=11, textColor=GRAY_MED,
                         spaceAfter=3),
    }


# ==================== PAGE 1: COVER ====================
def build_cover(data: dict, styles: dict) -> list:
    story = []
    project_name = data.get("projectName", "Untitled Project")
    date_str = datetime.now().strftime("%B %d, %Y")

    # Large top spacer
    story.append(Spacer(1, 1.8 * inch))

    # Gold accent line
    story.append(HRFlowable(width="100%", thickness=3, color=GOLD, spaceAfter=24))

    # Title
    story.append(Paragraph("ERP Vendor Evaluation Report", styles["cover_title"]))

    # Project name
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(project_name, styles["cover_subtitle"]))

    story.append(Spacer(1, 0.6 * inch))

    # Metadata block
    story.append(Paragraph(f"Prepared by: <b>Avero Caliber</b>", styles["cover_meta"]))
    story.append(Paragraph(f"Date: {date_str}", styles["cover_meta"]))

    vendors = data.get("evaluation", {}).get("vendors", [])
    num_vendors = len(vendors)
    reqs_count = sum(
        ms.get("requirementCount", 0)
        for v in vendors[:1]
        for ms in v.get("moduleScores", {}).values()
    )
    story.append(Paragraph(
        f"Vendors Evaluated: {num_vendors}",
        styles["cover_meta"]
    ))

    story.append(Spacer(1, 0.6 * inch))

    # Bottom gold line
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=12))
    story.append(Paragraph(
        "This document contains confidential and proprietary information prepared exclusively "
        "for the use of the named client. Do not distribute without permission.",
        styles["footer_note"]
    ))

    story.append(PageBreak())
    return story


# ==================== PAGE 2: EXECUTIVE SUMMARY ====================
def build_executive_summary(data: dict, styles: dict) -> list:
    story = []
    evaluation = data.get("evaluation", {})
    vendors = evaluation.get("vendors", [])
    project_name = data.get("projectName", "Untitled Project")

    story.append(Paragraph("Executive Summary", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    # Auto-generated summary paragraph
    if vendors:
        top = vendors[0]
        modules_count = len(top.get("moduleScores", {}))
        # Count unique requirements across modules
        total_reqs = sum(ms.get("requirementCount", 0)
                         for ms in top.get("moduleScores", {}).values())

        summary_parts = [
            f"{len(vendors)} vendor{'s' if len(vendors) != 1 else ''} "
            f"{'were' if len(vendors) != 1 else 'was'} evaluated against "
            f"{total_reqs} requirements across {modules_count} functional module"
            f"{'s' if modules_count != 1 else ''}. "
        ]
        if len(vendors) >= 1:
            summary_parts.append(
                f"<b>{top['vendorName']}</b> achieved the highest overall fit score "
                f"at <b>{top['overallScore']:.1f}%</b>"
            )
        if len(vendors) >= 2:
            second = vendors[1]
            summary_parts.append(
                f", followed by <b>{second['vendorName']}</b> at <b>{second['overallScore']:.1f}%</b>"
            )
        summary_parts.append(
            ". Scores reflect weighted performance across all evaluated functional modules, "
            "with critical requirements carrying a 1.5× weighting factor."
        )
        story.append(Paragraph("".join(summary_parts), styles["summary_text"]))
        story.append(Spacer(1, 0.15 * inch))

    # Ranking table
    if vendors:
        story.append(Paragraph("Overall Vendor Rankings", styles["subsection_header"]))

        # Build table data
        header_row = [
            Paragraph("Rank", styles["table_header"]),
            Paragraph("Vendor", styles["table_header"]),
            Paragraph("Platform Type", styles["table_header"]),
            Paragraph("Overall Fit Score", styles["table_header"]),
            Paragraph("Assessment", styles["table_header"]),
        ]
        table_data = [header_row]

        vendor_profiles_map = {v["vendorId"]: v for v in vendors}
        all_vendor_info = data.get("allVendors", [])
        platform_type_map = {v["id"]: v.get("platformType", "erp") for v in all_vendor_info}

        for i, v in enumerate(vendors):
            score = v["overallScore"]
            txt_color, bg_color = score_color(score)
            platform_type = platform_type_map.get(v["vendorId"], "erp").upper()
            assessment = "Strong Fit" if score >= 80 else ("Moderate Fit" if score >= 60 else "Weak Fit")

            score_para = Paragraph(
                f'<font color="{txt_color.hexval()}" name="{FONT_BOLD}">'
                f'<b>{score:.1f}%</b></font>',
                styles["table_cell_center"]
            )
            table_data.append([
                Paragraph(f"#{i+1}", styles["table_cell_center"]),
                Paragraph(f"<b>{v['vendorName']}</b>", styles["table_cell"]),
                Paragraph(platform_type, styles["table_cell_center"]),
                score_para,
                Paragraph(assessment, styles["table_cell_center"]),
            ])

        col_widths = [0.45 * inch, 2.2 * inch, 1.2 * inch, 1.4 * inch, 1.25 * inch]
        tbl = Table(table_data, colWidths=col_widths)

        # Build dynamic style commands for score background colors
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), white),
            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("ALIGN", (1, 1), (1, -1), "LEFT"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, GRAY_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, BG_LIGHT]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]

        # Color score column cells
        for i, v in enumerate(vendors):
            row = i + 1
            score = v["overallScore"]
            _, bg = score_color(score)
            style_cmds.append(("BACKGROUND", (3, row), (3, row), bg))

        tbl.setStyle(TableStyle(style_cmds))
        story.append(tbl)

    story.append(PageBreak())
    return story


# ==================== PAGE 3-4: MODULE SCORES MATRIX ====================
def build_module_scores(data: dict, styles: dict) -> list:
    story = []
    evaluation = data.get("evaluation", {})
    vendors = evaluation.get("vendors", [])

    story.append(Paragraph("Module-Level Comparison", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    if not vendors:
        story.append(Paragraph("No evaluation data available.", styles["body"]))
        story.append(PageBreak())
        return story

    # Gather all modules, grouped by category
    all_modules: dict[str, list[tuple[str, float]]] = {}  # category -> [(module, weight)]
    module_weights = evaluation.get("moduleWeights", {})
    # Use first vendor's moduleScores to get all modules
    for module_name, ms in vendors[0].get("moduleScores", {}).items():
        category = ms.get("category", "Other")
        if category not in all_modules:
            all_modules[category] = []
        all_modules[category].append((module_name, ms.get("weight", 5)))

    # Build header
    vendor_names = [v["vendorShortName"] or v["vendorName"][:8] for v in vendors]
    header = (
        [Paragraph("Module", styles["table_header"])] +
        [Paragraph("Wt.", styles["table_header"])] +
        [Paragraph(n, styles["table_header"]) for n in vendor_names]
    )

    table_data = [header]
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, GRAY_LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ]

    row_idx = 1
    for category, modules in sorted(all_modules.items()):
        # Category header row
        cat_row = (
            [Paragraph(category.upper(), styles["category_row"])] +
            [Paragraph("", styles["category_row"])] +
            [Paragraph("", styles["category_row"]) for _ in vendors]
        )
        table_data.append(cat_row)
        style_cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), LIGHT_NAVY))
        style_cmds.append(("SPAN", (0, row_idx), (-1, row_idx)))
        row_idx += 1

        for module_name, weight in sorted(modules, key=lambda x: x[0]):
            row = [
                Paragraph(module_name, styles["table_cell"]),
                Paragraph(str(int(weight)), styles["table_cell_center"]),
            ]
            for v in vendors:
                ms = v.get("moduleScores", {}).get(module_name, {})
                score = ms.get("score", 0)
                txt_c, bg_c = score_color(score)
                row.append(Paragraph(
                    f'<font color="{txt_c.hexval()}"><b>{score:.0f}%</b></font>',
                    styles["table_cell_center"]
                ))
                style_cmds.append(("BACKGROUND", (2 + vendors.index(v), row_idx),
                                   (2 + vendors.index(v), row_idx), bg_c))

            style_cmds.append(("ROWBACKGROUNDS", (0, row_idx), (1, row_idx),
                               [white if row_idx % 2 == 0 else BG_LIGHT]))
            table_data.append(row)
            row_idx += 1

    # Dynamic column widths
    name_col = 2.1 * inch
    wt_col = 0.35 * inch
    remaining = CONTENT_W - name_col - wt_col
    vendor_col_w = remaining / max(len(vendors), 1)
    col_widths = [name_col, wt_col] + [vendor_col_w] * len(vendors)

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)

    story.append(PageBreak())
    return story


# ==================== GAP ANALYSIS ====================
def build_gap_analysis(data: dict, styles: dict) -> list:
    story = []
    evaluation = data.get("evaluation", {})
    vendors = evaluation.get("vendors", [])
    gaps = evaluation.get("gaps", [])

    story.append(Paragraph("Gap Analysis — Critical Requirements", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=10))

    if not gaps:
        story.append(Paragraph(
            "No significant gaps identified. All critical requirements have adequate vendor coverage.",
            styles["body"]
        ))
        story.append(PageBreak())
        return story

    # Filter to only Critical criticality gaps
    critical_gaps = [g for g in gaps if g.get("criticality") == "Critical"]

    if not critical_gaps:
        story.append(Paragraph(
            "No critical requirement gaps identified. All critical requirements show adequate vendor coverage.",
            styles["body"]
        ))
        story.append(PageBreak())
        return story

    story.append(Paragraph(
        f"The following {len(critical_gaps)} critical requirements have one or more vendors "
        f"scoring T (Theoretical) or N (Not Supported). These represent areas of significant risk.",
        styles["summary_text"]
    ))
    story.append(Spacer(1, 0.1 * inch))

    # Group by functional area
    by_module: dict[str, list] = {}
    for gap in critical_gaps:
        fa = gap.get("functionalArea", "Unknown")
        by_module.setdefault(fa, []).append(gap)

    vendor_short_names = {v["vendorId"]: (v.get("vendorShortName") or v["vendorName"][:8])
                          for v in vendors}
    vendor_ids = [v["vendorId"] for v in vendors]

    for module_name, module_gaps in sorted(by_module.items()):
        # Limit to top 10 per module
        shown_gaps = module_gaps[:10]

        story.append(Paragraph(module_name, styles["subsection_header"]))

        # Header row
        header = (
            [Paragraph("Req #", styles["table_header"])] +
            [Paragraph("Description", styles["table_header"])] +
            [Paragraph(vendor_short_names.get(vid, "?"), styles["table_header"])
             for vid in vendor_ids]
        )
        table_data = [header]

        for gap in shown_gaps:
            desc = gap.get("description", "")
            desc_short = (desc[:80] + "…") if len(desc) > 80 else desc
            scores = gap.get("scores", {})
            row = [
                Paragraph(gap.get("reqNumber", ""), styles["table_cell_center"]),
                Paragraph(desc_short, styles["table_cell"]),
            ]
            for vid in vendor_ids:
                s = scores.get(vid) or scores.get(str(vid), "")
                color = score_letter_color(s)
                row.append(Paragraph(
                    f'<font color="{color.hexval()}"><b>{s or "—"}</b></font>',
                    styles["table_cell_center"]
                ))
            table_data.append(row)

        req_col = 0.55 * inch
        desc_col = 2.8 * inch
        remaining = CONTENT_W - req_col - desc_col
        v_col_w = remaining / max(len(vendor_ids), 1)
        col_widths = [req_col, desc_col] + [v_col_w] * len(vendor_ids)

        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), white),
            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.3, GRAY_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, BG_LIGHT]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ]

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle(style_cmds))
        story.append(KeepTogether([tbl, Spacer(1, 0.15 * inch)]))

    story.append(PageBreak())
    return story


# ==================== VENDOR PROFILES ====================
def build_vendor_profiles(data: dict, styles: dict) -> list:
    story = []
    evaluation = data.get("evaluation", {})
    vendors = evaluation.get("vendors", [])
    all_vendor_info = data.get("allVendors", [])
    vendor_info_map = {v["id"]: v for v in all_vendor_info}

    story.append(Paragraph("Vendor Profiles", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    for v in vendors:
        vid = v["vendorId"]
        info = vendor_info_map.get(vid, {})
        color_hex = v.get("color", "#1a2744")
        try:
            accent_color = HexColor(color_hex)
        except Exception:
            accent_color = NAVY

        # Vendor name + color bar
        name_block = [
            ColorBar(accent_color, height=4),
            Spacer(1, 4),
            Paragraph(v["vendorName"], styles["subsection_header"]),
        ]

        # Platform type badge
        platform_type = info.get("platformType", "erp").upper()
        platform_label = {"ERP": "Enterprise Resource Planning", "EAM": "Enterprise Asset Management",
                          "PMS": "Property Management System"}.get(platform_type, platform_type)
        name_block.append(Paragraph(
            f'Platform Type: <b>{platform_type}</b> — {platform_label}',
            styles["body_small"]
        ))

        if info.get("description"):
            name_block.append(Paragraph(info["description"], styles["body_small"]))

        name_block.append(Spacer(1, 6))
        story.extend(name_block)

        # 2-column layout: Strengths | Weaknesses
        strengths = info.get("strengths") or []
        weaknesses = info.get("weaknesses") or []

        if isinstance(strengths, str):
            try:
                strengths = json.loads(strengths)
            except Exception:
                strengths = [strengths]
        if isinstance(weaknesses, str):
            try:
                weaknesses = json.loads(weaknesses)
            except Exception:
                weaknesses = [weaknesses]

        def make_bullets(items, label, label_color):
            content = [Paragraph(f'<font color="{label_color.hexval()}"><b>{label}</b></font>',
                                 styles["body"])]
            for item in items:
                content.append(Paragraph(f"• {item}", styles["bullet"]))
            return content

        str_items = make_bullets(strengths, "Strengths", SCORE_GREEN)
        weak_items = make_bullets(weaknesses, "Weaknesses", SCORE_RED)

        col_w = (CONTENT_W - 0.2 * inch) / 2

        tbl_data = [[str_items, weak_items]]
        two_col = Table(tbl_data, colWidths=[col_w, col_w])
        two_col.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 1), (0, -1), 10),
        ]))
        story.append(two_col)
        story.append(Spacer(1, 0.2 * inch))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_LIGHT, spaceAfter=12))

    story.append(PageBreak())
    return story


# ==================== METHODOLOGY ====================
def build_methodology(data: dict, styles: dict) -> list:
    story = []
    evaluation = data.get("evaluation", {})
    module_weights = evaluation.get("moduleWeights", {})

    story.append(Paragraph("Evaluation Methodology", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    # Scoring model
    story.append(Paragraph("Scoring Model", styles["subsection_header"]))
    story.append(Paragraph(
        "Each vendor requirement response is scored using a five-point scale. "
        "Critical requirements are weighted 1.5× to reflect their greater importance to the organization.",
        styles["body"]
    ))

    score_data = [
        [Paragraph("Code", styles["table_header"]),
         Paragraph("Meaning", styles["table_header"]),
         Paragraph("Points", styles["table_header"]),
         Paragraph("Description", styles["table_header"])],
        [Paragraph("S", styles["table_cell_center"]),
         Paragraph("Standard", styles["table_cell"]),
         Paragraph("5", styles["table_cell_center"]),
         Paragraph("Fully supported out-of-the-box, no customization required", styles["table_cell"])],
        [Paragraph("F", styles["table_cell_center"]),
         Paragraph("Future", styles["table_cell"]),
         Paragraph("4", styles["table_cell_center"]),
         Paragraph("Supported in a future release within the contract period", styles["table_cell"])],
        [Paragraph("C", styles["table_cell_center"]),
         Paragraph("Customization", styles["table_cell"]),
         Paragraph("3", styles["table_cell_center"]),
         Paragraph("Supported through configuration, customization, or third-party add-on", styles["table_cell"])],
        [Paragraph("T", styles["table_cell_center"]),
         Paragraph("Third Party", styles["table_cell"]),
         Paragraph("2", styles["table_cell_center"]),
         Paragraph("Requires a separate third-party product or significant integration", styles["table_cell"])],
        [Paragraph("N", styles["table_cell_center"]),
         Paragraph("Not Supported", styles["table_cell"]),
         Paragraph("0", styles["table_cell_center"]),
         Paragraph("Not supported — no path to implementation identified", styles["table_cell"])],
    ]

    tbl = Table(score_data, colWidths=[0.5 * inch, 1.2 * inch, 0.55 * inch, CONTENT_W - 2.25 * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, GRAY_LIGHT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, BG_LIGHT]),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (2, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.2 * inch))

    # Weighting
    story.append(Paragraph("Criticality Weighting", styles["subsection_header"]))
    story.append(Paragraph(
        "• <b>Critical</b> requirements: 1.5× weight multiplier applied to both numerator and denominator.",
        styles["bullet"]
    ))
    story.append(Paragraph(
        "• <b>Desired</b> requirements: 1.0× weight (standard scoring).",
        styles["bullet"]
    ))
    story.append(Paragraph(
        "• <b>Not Required</b> and <b>Not Applicable</b> requirements are excluded from all scoring calculations.",
        styles["bullet"]
    ))
    story.append(Spacer(1, 0.15 * inch))

    # Module weights table
    if module_weights:
        story.append(Paragraph("Module Weights", styles["subsection_header"]))
        story.append(Paragraph(
            "The following weights were applied to each functional module when computing the overall fit score:",
            styles["body"]
        ))

        wt_data = [[
            Paragraph("Module", styles["table_header"]),
            Paragraph("Weight", styles["table_header"]),
        ]]
        for module, weight in sorted(module_weights.items()):
            wt_data.append([
                Paragraph(module, styles["table_cell"]),
                Paragraph(str(weight), styles["table_cell_center"]),
            ])

        wt_tbl = Table(wt_data, colWidths=[CONTENT_W - 1.0 * inch, 1.0 * inch])
        wt_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), white),
            ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, GRAY_LIGHT),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, BG_LIGHT]),
            ("ALIGN", (1, 0), (1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(wt_tbl)

    return story


# ==================== MAIN ====================
def generate_report(json_path: str, output_path: str):
    with open(json_path, "r") as f:
        data = json.load(f)

    setup_fonts()
    styles = build_styles()

    project_name = data.get("projectName", "ERP Evaluation")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        title=f"ERP Vendor Evaluation Report — {project_name}",
        author="Perplexity Computer",
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 0.3 * inch,
        bottomMargin=MARGIN + 0.15 * inch,
    )

    story = []
    story.extend(build_cover(data, styles))
    story.extend(build_executive_summary(data, styles))
    story.extend(build_module_scores(data, styles))
    story.extend(build_gap_analysis(data, styles))
    story.extend(build_vendor_profiles(data, styles))
    story.extend(build_methodology(data, styles))

    hf = make_header_footer(project_name)
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"[OK] Report saved to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate-report.py <input.json> <output.pdf>", file=sys.stderr)
        sys.exit(1)
    generate_report(sys.argv[1], sys.argv[2])
