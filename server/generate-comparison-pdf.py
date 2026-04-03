#!/usr/bin/env python3
"""
ERP Vendor Comparison Report — PDF Generator
Avero Caliber branding: Navy (#1a2744) + Gold (#d4a853)
Multi-section comparison document combining all evaluation data.
"""

import sys
import json
import urllib.request
from pathlib import Path
from datetime import datetime
import io

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether, Image
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
    global FONT_REGULAR, FONT_BOLD
    try:
        font_url = "https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf"
        font_path = FONT_DIR / "DMSans.ttf"
        if not font_path.exists():
            req = urllib.request.Request(font_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                font_path.write_bytes(resp.read())
        pdfmetrics.registerFont(TTFont("DMSans", str(font_path)))
        pdfmetrics.registerFont(TTFont("DMSans-Bold", str(font_path)))
        pdfmetrics.registerFontFamily("DMSans", normal="DMSans", bold="DMSans-Bold",
                                      italic="DMSans", boldItalic="DMSans-Bold")
        FONT_REGULAR = "DMSans"
        FONT_BOLD = "DMSans-Bold"
    except Exception as e:
        print(f"[WARN] Could not load DM Sans ({e}), using Helvetica", file=sys.stderr)


def score_color(score):
    if score >= 80:
        return SCORE_GREEN, SCORE_GREEN_BG
    elif score >= 60:
        return SCORE_GOLD, SCORE_GOLD_BG
    else:
        return SCORE_RED, SCORE_RED_BG

def score_letter_color(letter):
    return {
        "S": SCORE_GREEN,
        "F": HexColor("#3b82f6"),
        "C": SCORE_GOLD,
        "T": HexColor("#f97316"),
        "N": SCORE_RED,
    }.get(letter, GRAY_DARK)

# ==================== CUSTOM FLOWABLES ====================
class ColorBar(Flowable):
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
def make_header_footer(project_name):
    def draw_hf(canvas, doc):
        canvas.saveState()
        page_num = doc.page
        header_y = PAGE_H - MARGIN + 4
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(1.5)
        canvas.line(MARGIN, header_y - 14, PAGE_W - MARGIN, header_y - 14)
        canvas.setFont(FONT_BOLD, 8)
        canvas.setFillColor(NAVY)
        canvas.drawString(MARGIN, header_y - 10, "Avero Caliber — Vendor Comparison Report")
        canvas.setFont(FONT_REGULAR, 8)
        canvas.setFillColor(GRAY_DARK)
        canvas.drawRightString(PAGE_W - MARGIN, header_y - 10, project_name)
        footer_y = MARGIN - 10
        canvas.setStrokeColor(GRAY_LIGHT)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, footer_y + 14, PAGE_W - MARGIN, footer_y + 14)
        canvas.setFont(FONT_REGULAR, 8)
        canvas.setFillColor(GRAY_DARK)
        canvas.drawCentredString(PAGE_W / 2, footer_y, f"Page {page_num}")
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
        "cover_title": S("cover_title", fontSize=32, leading=38, fontName=FONT_BOLD, textColor=NAVY, spaceAfter=8),
        "cover_subtitle": S("cover_subtitle", fontSize=16, leading=20, textColor=NAVY, spaceAfter=4),
        "cover_meta": S("cover_meta", fontSize=11, leading=16, textColor=GRAY_DARK, spaceAfter=4),
        "section_header": S("section_header", fontSize=18, leading=22, fontName=FONT_BOLD, textColor=NAVY, spaceBefore=4, spaceAfter=12),
        "subsection_header": S("subsection_header", fontSize=13, leading=17, fontName=FONT_BOLD, textColor=NAVY, spaceBefore=8, spaceAfter=6),
        "body": S("body", fontSize=9.5, leading=14, spaceAfter=6),
        "body_small": S("body_small", fontSize=8.5, leading=12, textColor=GRAY_DARK, spaceAfter=4),
        "summary_text": S("summary_text", fontSize=10, leading=15, spaceAfter=8, textColor=GRAY_DARK),
        "bullet": S("bullet", fontSize=9.5, leading=14, leftIndent=12, bulletIndent=0, spaceAfter=3),
        "table_header": S("table_header", fontSize=8.5, fontName=FONT_BOLD, textColor=white, leading=11),
        "table_cell": S("table_cell", fontSize=8.5, leading=11, textColor=TEXT_DARK),
        "table_cell_center": S("table_cell_center", fontSize=8.5, leading=11, textColor=TEXT_DARK, alignment=TA_CENTER),
        "category_row": S("category_row", fontSize=8.5, fontName=FONT_BOLD, textColor=white, leading=11),
        "score_cell": S("score_cell", fontSize=9, fontName=FONT_BOLD, leading=12, alignment=TA_CENTER),
        "methodology_body": S("methodology_body", fontSize=9, leading=14, textColor=GRAY_DARK, spaceAfter=4),
        "footer_note": S("footer_note", fontSize=8, leading=11, textColor=GRAY_MED, spaceAfter=3),
    }


# ==================== STANDARD TABLE STYLE ====================
def std_table_style():
    return [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, GRAY_LIGHT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, BG_LIGHT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]


# ==================== SECTION 1: COVER ====================
def build_cover(data, styles):
    story = []
    project_name = data.get("project", {}).get("name", "Untitled Project")
    date_str = datetime.now().strftime("%B %d, %Y")
    vendors = data.get("evaluation", {}).get("vendors", [])

    story.append(Spacer(1, 1.8 * inch))
    story.append(HRFlowable(width="100%", thickness=3, color=GOLD, spaceAfter=24))
    story.append(Paragraph("Vendor Comparison Report", styles["cover_title"]))
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(project_name, styles["cover_subtitle"]))
    story.append(Spacer(1, 0.6 * inch))
    story.append(Paragraph(f"Prepared by: <b>Avero Caliber</b>", styles["cover_meta"]))
    story.append(Paragraph(f"Date: {date_str}", styles["cover_meta"]))
    story.append(Paragraph(f"Vendors Evaluated: {len(vendors)}", styles["cover_meta"]))

    total_reqs = sum(
        ms.get("requirementCount", 0)
        for v in vendors[:1]
        for ms in v.get("moduleScores", {}).values()
    )
    if total_reqs:
        story.append(Paragraph(f"Total Requirements: {total_reqs}", styles["cover_meta"]))

    story.append(Spacer(1, 0.6 * inch))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceAfter=12))
    story.append(Paragraph(
        "This document contains confidential and proprietary information prepared exclusively "
        "for the use of the named client. Do not distribute without permission.",
        styles["footer_note"]
    ))
    story.append(PageBreak())
    return story


# ==================== SECTION 2: EXECUTIVE SUMMARY ====================
def build_executive_summary(data, styles):
    story = []
    vendors = data.get("evaluation", {}).get("vendors", [])

    story.append(Paragraph("1. Executive Summary", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    if vendors:
        top = vendors[0]
        modules_count = len(top.get("moduleScores", {}))
        total_reqs = sum(ms.get("requirementCount", 0) for ms in top.get("moduleScores", {}).values())
        parts = [
            f"{len(vendors)} vendor{'s' if len(vendors) != 1 else ''} "
            f"{'were' if len(vendors) != 1 else 'was'} evaluated against "
            f"{total_reqs} requirements across {modules_count} functional module"
            f"{'s' if modules_count != 1 else ''}. "
        ]
        parts.append(
            f"<b>{top['vendorName']}</b> achieved the highest overall fit score "
            f"at <b>{top['overallScore']:.1f}%</b>"
        )
        if len(vendors) >= 2:
            parts.append(f", followed by <b>{vendors[1]['vendorName']}</b> at <b>{vendors[1]['overallScore']:.1f}%</b>")
        if len(vendors) >= 3:
            parts.append(f" and <b>{vendors[2]['vendorName']}</b> at <b>{vendors[2]['overallScore']:.1f}%</b>")
        parts.append(".")
        story.append(Paragraph("".join(parts), styles["summary_text"]))
        story.append(Spacer(1, 0.1 * inch))

        # Key differentiators
        if len(vendors) >= 2:
            story.append(Paragraph("Key Differentiators", styles["subsection_header"]))
            for v in vendors[:3]:
                info = next((av for av in data.get("allVendors", []) if av.get("id") == v["vendorId"]), {})
                strengths = info.get("strengths", [])
                if isinstance(strengths, str):
                    try: strengths = json.loads(strengths)
                    except: strengths = [strengths]
                top_strength = strengths[0] if strengths else "N/A"
                story.append(Paragraph(
                    f"• <b>{v['vendorName']}</b> ({v['overallScore']:.1f}%): {top_strength}",
                    styles["bullet"]
                ))
            story.append(Spacer(1, 0.1 * inch))

        # Recommendation
        story.append(Paragraph("Recommendation", styles["subsection_header"]))
        if top["overallScore"] >= 80:
            rec = f"{top['vendorName']} demonstrates a strong overall fit and is recommended as the primary candidate for further evaluation and negotiation."
        elif top["overallScore"] >= 60:
            rec = f"{top['vendorName']} shows a moderate fit. Further evaluation of specific module gaps is recommended before proceeding."
        else:
            rec = f"No vendor achieved a strong fit score. A review of requirements or additional vendor evaluation may be necessary."
        story.append(Paragraph(rec, styles["summary_text"]))

    story.append(PageBreak())
    return story


# ==================== SECTION 3: METHODOLOGY ====================
def build_methodology(data, styles):
    story = []
    story.append(Paragraph("2. Methodology", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    story.append(Paragraph("Scoring Model", styles["subsection_header"]))
    story.append(Paragraph(
        "Each vendor requirement response is scored using a five-point scale. "
        "Critical requirements carry a 1.5× weighting factor.",
        styles["body"]
    ))

    score_data = [
        [Paragraph("Code", styles["table_header"]), Paragraph("Meaning", styles["table_header"]),
         Paragraph("Points", styles["table_header"]), Paragraph("Description", styles["table_header"])],
        [Paragraph("S", styles["table_cell_center"]), Paragraph("Standard", styles["table_cell"]),
         Paragraph("5", styles["table_cell_center"]), Paragraph("Fully supported out-of-the-box", styles["table_cell"])],
        [Paragraph("F", styles["table_cell_center"]), Paragraph("Future", styles["table_cell"]),
         Paragraph("4", styles["table_cell_center"]), Paragraph("Supported in a future release", styles["table_cell"])],
        [Paragraph("C", styles["table_cell_center"]), Paragraph("Customization", styles["table_cell"]),
         Paragraph("3", styles["table_cell_center"]), Paragraph("Configuration or customization required", styles["table_cell"])],
        [Paragraph("T", styles["table_cell_center"]), Paragraph("Third Party", styles["table_cell"]),
         Paragraph("2", styles["table_cell_center"]), Paragraph("Requires separate third-party product", styles["table_cell"])],
        [Paragraph("N", styles["table_cell_center"]), Paragraph("Not Supported", styles["table_cell"]),
         Paragraph("0", styles["table_cell_center"]), Paragraph("Not supported", styles["table_cell"])],
    ]
    tbl = Table(score_data, colWidths=[0.5*inch, 1.2*inch, 0.55*inch, CONTENT_W - 2.25*inch])
    cmds = std_table_style() + [("ALIGN", (0,0), (0,-1), "CENTER"), ("ALIGN", (2,0), (2,-1), "CENTER")]
    tbl.setStyle(TableStyle(cmds))
    story.append(tbl)
    story.append(Spacer(1, 0.15 * inch))

    # Custom criteria note
    custom_criteria = data.get("customCriteria", [])
    if custom_criteria:
        story.append(Paragraph("Custom Criteria", styles["subsection_header"]))
        story.append(Paragraph(
            f"{len(custom_criteria)} custom evaluation criteria were also scored on a 1–10 scale and contribute to the overall assessment.",
            styles["body"]
        ))
        for c in custom_criteria:
            story.append(Paragraph(f"• <b>{c.get('name', '')}</b> (Weight: {c.get('weight', 5)}/10): {c.get('description', '')}", styles["bullet"]))

    story.append(PageBreak())
    return story


# ==================== SECTION 4: OVERALL RANKINGS ====================
def build_overall_rankings(data, styles):
    story = []
    vendors = data.get("evaluation", {}).get("vendors", [])

    story.append(Paragraph("3. Overall Rankings", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    # Try to generate a chart image using matplotlib
    chart_image = None
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches

        fig, ax = plt.subplots(figsize=(6, max(2.5, len(vendors) * 0.6)))
        names = [v["vendorShortName"] for v in reversed(vendors)]
        scores = [v["overallScore"] for v in reversed(vendors)]
        colors = [v.get("color", "#1a2744") for v in reversed(vendors)]

        bars = ax.barh(names, scores, color=colors, height=0.6)
        ax.set_xlim(0, 100)
        ax.set_xlabel("Weighted Fit Score (%)", fontsize=9)
        ax.tick_params(labelsize=8)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

        for bar, score in zip(bars, scores):
            ax.text(bar.get_width() + 1.5, bar.get_y() + bar.get_height()/2,
                    f"{score:.1f}%", va="center", fontsize=8, fontweight="bold")

        plt.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        chart_image = buf
    except Exception as e:
        print(f"[WARN] Could not generate chart: {e}", file=sys.stderr)

    if chart_image:
        story.append(Image(chart_image, width=5.5*inch, height=max(2*inch, len(vendors) * 0.45*inch)))
        story.append(Spacer(1, 0.15 * inch))

    # Rankings table
    story.append(Paragraph("Vendor Rankings", styles["subsection_header"]))
    all_vendor_info = data.get("allVendors", [])
    platform_map = {v["id"]: v.get("platformType", "erp") for v in all_vendor_info}

    header_row = [
        Paragraph("Rank", styles["table_header"]),
        Paragraph("Vendor", styles["table_header"]),
        Paragraph("Type", styles["table_header"]),
        Paragraph("Score", styles["table_header"]),
        Paragraph("Assessment", styles["table_header"]),
        Paragraph("Key Strength", styles["table_header"]),
    ]
    table_data = [header_row]

    for i, v in enumerate(vendors):
        score = v["overallScore"]
        txt_c, bg_c = score_color(score)
        ptype = platform_map.get(v["vendorId"], "erp").upper()
        assessment = "Strong Fit" if score >= 80 else ("Moderate Fit" if score >= 60 else "Weak Fit")
        info = next((av for av in all_vendor_info if av.get("id") == v["vendorId"]), {})
        strengths = info.get("strengths", [])
        if isinstance(strengths, str):
            try: strengths = json.loads(strengths)
            except: strengths = []
        top_str = (strengths[0][:40] + "…") if strengths and len(strengths[0]) > 40 else (strengths[0] if strengths else "—")

        score_para = Paragraph(f'<font color="{txt_c.hexval()}"><b>{score:.1f}%</b></font>', styles["table_cell_center"])
        table_data.append([
            Paragraph(f"#{i+1}", styles["table_cell_center"]),
            Paragraph(f"<b>{v['vendorName']}</b>", styles["table_cell"]),
            Paragraph(ptype, styles["table_cell_center"]),
            score_para,
            Paragraph(assessment, styles["table_cell_center"]),
            Paragraph(top_str, styles["table_cell"]),
        ])

    col_widths = [0.4*inch, 1.6*inch, 0.6*inch, 0.9*inch, 1.0*inch, CONTENT_W - 4.5*inch]
    tbl = Table(table_data, colWidths=col_widths)
    cmds = std_table_style() + [("ALIGN", (0,0), (0,-1), "CENTER"), ("ALIGN", (2,0), (3,-1), "CENTER")]
    for i, v in enumerate(vendors):
        _, bg = score_color(v["overallScore"])
        cmds.append(("BACKGROUND", (3, i+1), (3, i+1), bg))
    tbl.setStyle(TableStyle(cmds))
    story.append(tbl)

    story.append(PageBreak())
    return story


# ==================== SECTION 5: COST ANALYSIS ====================
def build_cost_analysis(data, styles):
    costs = data.get("costs", [])
    if not costs:
        return []

    story = []
    story.append(Paragraph("4. Cost Analysis", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    header = [
        Paragraph("Vendor", styles["table_header"]),
        Paragraph("Implementation", styles["table_header"]),
        Paragraph("Annual", styles["table_header"]),
        Paragraph("7-Year TCO", styles["table_header"]),
    ]
    table_data = [header]

    lowest_tco = min((c.get("sevenYearTotal", 0) for c in costs if c.get("sevenYearTotal", 0) > 0), default=0)

    for c in costs:
        impl = c.get("implementationTotal", 0)
        annual = c.get("ongoingAnnual", 0)
        tco = c.get("sevenYearTotal", 0)
        is_lowest = tco > 0 and tco == lowest_tco
        name = c.get("vendorName", "Unknown")
        if is_lowest:
            name = f"★ {name}"
        table_data.append([
            Paragraph(f"<b>{name}</b>", styles["table_cell"]),
            Paragraph(f"${impl:,.0f}", styles["table_cell_center"]),
            Paragraph(f"${annual:,.0f}", styles["table_cell_center"]),
            Paragraph(f"${tco:,.0f}", styles["table_cell_center"]),
        ])

    col_widths = [2.5*inch, (CONTENT_W - 2.5*inch) / 3] * 1
    col_widths = [2.5*inch] + [(CONTENT_W - 2.5*inch) / 3] * 3
    tbl = Table(table_data, colWidths=col_widths)
    cmds = std_table_style() + [("ALIGN", (1,0), (-1,-1), "CENTER")]
    tbl.setStyle(TableStyle(cmds))
    story.append(tbl)

    if lowest_tco > 0:
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(f"★ Lowest 7-Year TCO: ${lowest_tco:,.0f}", styles["body_small"]))

    story.append(PageBreak())
    return story


# ==================== SECTION 6: MODULE COMPARISON ====================
def build_module_comparison(data, styles):
    story = []
    vendors = data.get("evaluation", {}).get("vendors", [])
    module_weights = data.get("weights", {}).get("moduleWeights", {})

    story.append(Paragraph("5. Module-by-Module Comparison", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    if not vendors:
        story.append(Paragraph("No evaluation data available.", styles["body"]))
        story.append(PageBreak())
        return story

    # Group modules by category
    all_modules = {}
    for module_name, ms in vendors[0].get("moduleScores", {}).items():
        category = ms.get("category", "Other")
        if category not in all_modules:
            all_modules[category] = []
        all_modules[category].append((module_name, ms.get("weight", 5)))

    vendor_names = [v["vendorShortName"] or v["vendorName"][:8] for v in vendors]
    header = (
        [Paragraph("Module", styles["table_header"])] +
        [Paragraph("Wt.", styles["table_header"])] +
        [Paragraph("Reqs", styles["table_header"])] +
        [Paragraph(n, styles["table_header"]) for n in vendor_names]
    )

    table_data = [header]
    style_cmds = std_table_style() + [("ALIGN", (1,0), (-1,-1), "CENTER")]
    row_idx = 1

    for category, modules in sorted(all_modules.items()):
        cat_row = ([Paragraph(category.upper(), styles["category_row"])] +
                   [Paragraph("", styles["category_row"])] * (2 + len(vendors)))
        table_data.append(cat_row)
        style_cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), LIGHT_NAVY))
        style_cmds.append(("SPAN", (0, row_idx), (-1, row_idx)))
        row_idx += 1

        for module_name, weight in sorted(modules, key=lambda x: x[0]):
            req_count = vendors[0].get("moduleScores", {}).get(module_name, {}).get("requirementCount", 0)
            row = [
                Paragraph(module_name, styles["table_cell"]),
                Paragraph(str(int(weight)), styles["table_cell_center"]),
                Paragraph(str(req_count), styles["table_cell_center"]),
            ]
            for v in vendors:
                ms = v.get("moduleScores", {}).get(module_name, {})
                score = ms.get("score", 0)
                txt_c, bg_c = score_color(score)
                row.append(Paragraph(
                    f'<font color="{txt_c.hexval()}"><b>{score:.0f}%</b></font>',
                    styles["table_cell_center"]
                ))
                style_cmds.append(("BACKGROUND", (3 + vendors.index(v), row_idx),
                                   (3 + vendors.index(v), row_idx), bg_c))
            table_data.append(row)
            row_idx += 1

    name_col = 1.8 * inch
    wt_col = 0.35 * inch
    req_col = 0.4 * inch
    remaining = CONTENT_W - name_col - wt_col - req_col
    vendor_col_w = remaining / max(len(vendors), 1)
    col_widths = [name_col, wt_col, req_col] + [vendor_col_w] * len(vendors)

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)

    story.append(PageBreak())
    return story


# ==================== SECTION 7: GAP ANALYSIS ====================
def build_gap_analysis(data, styles):
    story = []
    vendors = data.get("evaluation", {}).get("vendors", [])
    gaps = data.get("evaluation", {}).get("gaps", [])

    story.append(Paragraph("6. Gap Analysis Summary", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=10))

    if not gaps:
        story.append(Paragraph("No significant gaps identified.", styles["body"]))
        story.append(PageBreak())
        return story

    critical_gaps = [g for g in gaps if g.get("criticality") == "Critical"]

    # Summary stats
    story.append(Paragraph(f"Total gaps identified: <b>{len(gaps)}</b>", styles["body"]))
    story.append(Paragraph(f"Critical gaps: <b>{len(critical_gaps)}</b>", styles["body"]))
    story.append(Spacer(1, 0.1 * inch))

    # Gaps per vendor
    vendor_short_names = {v["vendorId"]: (v.get("vendorShortName") or v["vendorName"][:8]) for v in vendors}
    vendor_ids = [v["vendorId"] for v in vendors]

    # Count gaps per vendor (where vendor score is T or N)
    vendor_gap_counts = {vid: 0 for vid in vendor_ids}
    vendor_critical_gap_counts = {vid: 0 for vid in vendor_ids}
    for g in gaps:
        scores = g.get("scores", {})
        for vid in vendor_ids:
            s = scores.get(vid) or scores.get(str(vid), "")
            if s in ("T", "N"):
                vendor_gap_counts[vid] += 1
                if g.get("criticality") == "Critical":
                    vendor_critical_gap_counts[vid] += 1

    story.append(Paragraph("Gaps Per Vendor", styles["subsection_header"]))
    header = [Paragraph("Vendor", styles["table_header"]), Paragraph("Total Gaps", styles["table_header"]),
              Paragraph("Critical Gaps", styles["table_header"])]
    table_data = [header]
    for vid in vendor_ids:
        table_data.append([
            Paragraph(f"<b>{vendor_short_names.get(vid, '?')}</b>", styles["table_cell"]),
            Paragraph(str(vendor_gap_counts[vid]), styles["table_cell_center"]),
            Paragraph(str(vendor_critical_gap_counts[vid]), styles["table_cell_center"]),
        ])
    tbl = Table(table_data, colWidths=[3*inch, 1.75*inch, 1.75*inch])
    tbl.setStyle(TableStyle(std_table_style() + [("ALIGN", (1,0), (-1,-1), "CENTER")]))
    story.append(tbl)
    story.append(Spacer(1, 0.15 * inch))

    # Critical gaps detail (top 15)
    if critical_gaps:
        story.append(Paragraph("Critical Gap Details (Top 15)", styles["subsection_header"]))
        shown = critical_gaps[:15]
        header = (
            [Paragraph("Req #", styles["table_header"]),
             Paragraph("Module", styles["table_header"]),
             Paragraph("Description", styles["table_header"])] +
            [Paragraph(vendor_short_names.get(vid, "?"), styles["table_header"]) for vid in vendor_ids]
        )
        table_data = [header]
        for g in shown:
            desc = g.get("description", "")
            desc = (desc[:60] + "…") if len(desc) > 60 else desc
            scores = g.get("scores", {})
            row = [
                Paragraph(g.get("reqNumber", ""), styles["table_cell_center"]),
                Paragraph(g.get("functionalArea", ""), styles["table_cell"]),
                Paragraph(desc, styles["table_cell"]),
            ]
            for vid in vendor_ids:
                s = scores.get(vid) or scores.get(str(vid), "")
                color = score_letter_color(s)
                row.append(Paragraph(
                    f'<font color="{color.hexval()}"><b>{s or "—"}</b></font>',
                    styles["table_cell_center"]
                ))
            table_data.append(row)

        req_col = 0.5*inch
        mod_col = 1.2*inch
        desc_col = 2.0*inch
        remaining = CONTENT_W - req_col - mod_col - desc_col
        v_col_w = remaining / max(len(vendor_ids), 1)
        col_widths = [req_col, mod_col, desc_col] + [v_col_w] * len(vendor_ids)

        tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
        tbl.setStyle(TableStyle(std_table_style() + [("ALIGN", (0,0), (0,-1), "CENTER"), ("ALIGN", (3,0), (-1,-1), "CENTER")]))
        story.append(tbl)

    story.append(PageBreak())
    return story


# ==================== SECTION 8: CUSTOM CRITERIA ====================
def build_custom_criteria(data, styles):
    criteria = data.get("customCriteria", [])
    if not criteria:
        return []

    vendors = data.get("evaluation", {}).get("vendors", [])
    vendor_ids = [v["vendorId"] for v in vendors]
    vendor_names = {v["vendorId"]: v.get("vendorShortName", v["vendorName"][:8]) for v in vendors}

    story = []
    story.append(Paragraph("7. Custom Criteria Scores", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    # Matrix table
    header = ([Paragraph("Criterion", styles["table_header"]), Paragraph("Wt", styles["table_header"])] +
              [Paragraph(vendor_names.get(vid, "?"), styles["table_header"]) for vid in vendor_ids])
    table_data = [header]

    for c in criteria:
        scores = c.get("scores", [])
        score_map = {s["vendorId"]: s["score"] for s in scores}
        row = [
            Paragraph(f"<b>{c.get('name', '')}</b>", styles["table_cell"]),
            Paragraph(str(c.get("weight", 5)), styles["table_cell_center"]),
        ]
        for vid in vendor_ids:
            s = score_map.get(vid, 0)
            if s > 0:
                txt_c = SCORE_GREEN if s >= 8 else (SCORE_GOLD if s >= 5 else SCORE_RED)
                row.append(Paragraph(f'<font color="{txt_c.hexval()}"><b>{s}</b></font>', styles["table_cell_center"]))
            else:
                row.append(Paragraph("—", styles["table_cell_center"]))
        table_data.append(row)

    name_col = 2.0 * inch
    wt_col = 0.4 * inch
    remaining = CONTENT_W - name_col - wt_col
    v_col_w = remaining / max(len(vendor_ids), 1)
    col_widths = [name_col, wt_col] + [v_col_w] * len(vendor_ids)

    tbl = Table(table_data, colWidths=col_widths)
    tbl.setStyle(TableStyle(std_table_style() + [("ALIGN", (1,0), (-1,-1), "CENTER")]))
    story.append(tbl)

    story.append(PageBreak())
    return story


# ==================== SECTION 9: VENDOR PROFILES ====================
def build_vendor_profiles(data, styles):
    story = []
    vendors = data.get("evaluation", {}).get("vendors", [])
    all_vendor_info = data.get("allVendors", [])
    vendor_info_map = {v["id"]: v for v in all_vendor_info}

    story.append(Paragraph("8. Vendor Profiles", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    for v in vendors:
        vid = v["vendorId"]
        info = vendor_info_map.get(vid, {})
        color_hex = v.get("color", "#1a2744")
        try:
            accent_color = HexColor(color_hex)
        except:
            accent_color = NAVY

        story.append(ColorBar(accent_color, height=4))
        story.append(Spacer(1, 4))
        story.append(Paragraph(v["vendorName"], styles["subsection_header"]))

        platform_type = info.get("platformType", "erp").upper()
        story.append(Paragraph(f'Platform Type: <b>{platform_type}</b>', styles["body_small"]))
        story.append(Paragraph(f'Overall Score: <b>{v["overallScore"]:.1f}%</b>', styles["body_small"]))

        if info.get("description"):
            story.append(Paragraph(info["description"], styles["body_small"]))

        story.append(Spacer(1, 6))

        strengths = info.get("strengths", [])
        weaknesses = info.get("weaknesses", [])
        if isinstance(strengths, str):
            try: strengths = json.loads(strengths)
            except: strengths = [strengths]
        if isinstance(weaknesses, str):
            try: weaknesses = json.loads(weaknesses)
            except: weaknesses = [weaknesses]

        def make_bullets(items, label, label_color):
            content = [Paragraph(f'<font color="{label_color.hexval()}"><b>{label}</b></font>', styles["body"])]
            for item in items:
                content.append(Paragraph(f"• {item}", styles["bullet"]))
            return content

        str_items = make_bullets(strengths, "Strengths", SCORE_GREEN)
        weak_items = make_bullets(weaknesses, "Weaknesses", SCORE_RED)

        col_w = (CONTENT_W - 0.2 * inch) / 2
        tbl_data = [[str_items, weak_items]]
        two_col = Table(tbl_data, colWidths=[col_w, col_w])
        two_col.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ("LEFTPADDING", (0,0), (-1,-1), 0),
            ("RIGHTPADDING", (0,1), (0,-1), 10),
        ]))
        story.append(two_col)

        # Module score summary for this vendor
        module_scores = v.get("moduleScores", {})
        if module_scores:
            story.append(Spacer(1, 6))
            top_mods = sorted(module_scores.items(), key=lambda x: x[1].get("score", 0), reverse=True)[:5]
            story.append(Paragraph("Top Modules:", styles["body_small"]))
            for mod_name, ms in top_mods:
                s = ms.get("score", 0)
                txt_c, _ = score_color(s)
                story.append(Paragraph(
                    f'• {mod_name}: <font color="{txt_c.hexval()}"><b>{s:.0f}%</b></font>',
                    styles["bullet"]
                ))

        story.append(Spacer(1, 0.15 * inch))
        story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_LIGHT, spaceAfter=12))

    story.append(PageBreak())
    return story


# ==================== SECTION 10: APPENDIX ====================
def build_appendix(data, styles):
    story = []
    story.append(Paragraph("Appendix: Weight Configuration", styles["section_header"]))
    story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=14))

    module_weights = data.get("weights", {}).get("moduleWeights", {})
    if module_weights:
        story.append(Paragraph("Module Weights Used", styles["subsection_header"]))
        wt_data = [[Paragraph("Module", styles["table_header"]), Paragraph("Weight", styles["table_header"])]]
        for module, weight in sorted(module_weights.items()):
            wt_data.append([
                Paragraph(module, styles["table_cell"]),
                Paragraph(str(weight), styles["table_cell_center"]),
            ])
        wt_tbl = Table(wt_data, colWidths=[CONTENT_W - 1.0*inch, 1.0*inch])
        wt_tbl.setStyle(TableStyle(std_table_style() + [("ALIGN", (1,0), (1,-1), "CENTER")]))
        story.append(wt_tbl)

    return story


# ==================== MAIN ====================
def generate_report(json_path, output_path):
    with open(json_path, "r") as f:
        data = json.load(f)

    setup_fonts()
    styles = build_styles()
    project_name = data.get("project", {}).get("name", "ERP Evaluation")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        title=f"Vendor Comparison Report — {project_name}",
        author="Avero Caliber",
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 0.3 * inch,
        bottomMargin=MARGIN + 0.15 * inch,
    )

    story = []
    story.extend(build_cover(data, styles))
    story.extend(build_executive_summary(data, styles))
    story.extend(build_methodology(data, styles))
    story.extend(build_overall_rankings(data, styles))
    story.extend(build_cost_analysis(data, styles))
    story.extend(build_module_comparison(data, styles))
    story.extend(build_gap_analysis(data, styles))
    story.extend(build_custom_criteria(data, styles))
    story.extend(build_vendor_profiles(data, styles))
    story.extend(build_appendix(data, styles))

    hf = make_header_footer(project_name)
    doc.build(story, onFirstPage=hf, onLaterPages=hf)
    print(f"[OK] Comparison report saved to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate-comparison-pdf.py <input.json> <output.pdf>", file=sys.stderr)
        sys.exit(1)
    generate_report(sys.argv[1], sys.argv[2])
