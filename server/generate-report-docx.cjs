// Word document report generator
// Usage: node generate-report-docx.js <input.json> <output.docx>

const fs = require('fs');
const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, LevelFormat,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
} = docx;

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node generate-report-docx.js <input.json> <output.docx>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const { projectName, vendors: vendorResults, gaps, moduleWeights, allVendors } = data;
const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Colors
const NAVY = "1a2744";
const GOLD = "d4a853";
const GREEN = "22c55e";
const RED = "ef4444";
const LIGHT_GRAY = "F5F5F5";
const MED_GRAY = "E0E0E0";
const WHITE = "FFFFFF";

// Borders
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: MED_GRAY };
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};

// Page width in DXA (US Letter with 0.75" margins)
const PAGE_WIDTH = 12240;
const MARGIN = 1080; // 0.75"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 10080

function scoreColor(score) {
  if (score >= 80) return GREEN;
  if (score >= 60) return GOLD;
  return RED;
}

function scoreAssessment(score) {
  if (score >= 80) return "Strong Fit";
  if (score >= 60) return "Moderate Fit";
  return "Weak Fit";
}

function responseColor(code) {
  switch(code) {
    case 'S': return '22c55e';
    case 'F': return '84cc16';
    case 'C': return 'eab308';
    case 'T': return 'f97316';
    case 'N': return 'ef4444';
    default: return '999999';
  }
}

function cellMargins() {
  return { top: 40, bottom: 40, left: 80, right: 80 };
}

function headerCell(text, width) {
  return new TableCell({
    borders: allBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    margins: cellMargins(),
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text, bold: true, color: WHITE, font: "Arial", size: 18 })]
    })]
  });
}

function dataCell(text, width, opts = {}) {
  const { bold, color, fill, align } = opts;
  return new TableCell({
    borders: allBorders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins(),
    children: [new Paragraph({
      alignment: align || AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), bold: !!bold, color: color || "333333", font: "Arial", size: 18 })]
    })]
  });
}

// Build sections
const children = [];

// ===== COVER PAGE =====
children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));

// Gold line
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
  spacing: { after: 400 },
  children: []
}));

children.push(new Paragraph({
  spacing: { after: 200 },
  children: [new TextRun({ text: "ERP Vendor Evaluation Report", bold: true, color: NAVY, font: "Arial", size: 56 })]
}));

children.push(new Paragraph({
  spacing: { after: 400 },
  children: [new TextRun({ text: projectName || "Vendor Evaluation", color: "666666", font: "Arial", size: 32 })]
}));

children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Prepared by: Avero Caliber`, color: NAVY, font: "Arial", size: 22 })] }));
children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Date: ${today}`, color: NAVY, font: "Arial", size: 22 })] }));
children.push(new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: `Vendors Evaluated: ${vendorResults.length}`, color: NAVY, font: "Arial", size: 22 })] }));

// Gold line
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
  spacing: { after: 300 },
  children: []
}));

children.push(new Paragraph({
  spacing: { after: 200 },
  children: [new TextRun({ text: "This document contains confidential and proprietary information prepared exclusively for the use of the named client. Do not distribute without permission.", italics: true, color: "999999", font: "Arial", size: 16 })]
}));

// ===== EXECUTIVE SUMMARY =====
children.push(new Paragraph({ children: [new PageBreak()] }));

children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Executive Summary", bold: true, color: NAVY, font: "Arial", size: 36 })]
}));

// Gold underline
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
  spacing: { after: 300 },
  children: []
}));

// Count modules
const moduleCount = new Set();
vendorResults.forEach(v => Object.keys(v.moduleScores).forEach(m => moduleCount.add(m)));
const totalReqs = data.totalRequirements || "N/A";

const top = vendorResults[0];
const second = vendorResults.length > 1 ? vendorResults[1] : null;
let summary = `${vendorResults.length} vendors were evaluated against ${totalReqs} requirements across ${moduleCount.size} functional modules. `;
if (top) summary += `${top.vendorName} achieved the highest overall fit score at ${top.overallScore}%`;
if (second) summary += `, followed by ${second.vendorName} at ${second.overallScore}%`;
summary += ". Scores reflect weighted performance across all evaluated functional modules, with critical requirements carrying a 1.5× weighting factor.";

children.push(new Paragraph({
  spacing: { after: 400 },
  children: [new TextRun({ text: summary, font: "Arial", size: 20, color: "444444" })]
}));

// Ranking table
children.push(new Paragraph({
  spacing: { before: 200, after: 200 },
  children: [new TextRun({ text: "Overall Vendor Rankings", bold: true, color: NAVY, font: "Arial", size: 26 })]
}));

const rankColWidths = [800, 2800, 1800, 2200, 2480];
const rankHeaderRow = new TableRow({
  children: [
    headerCell("Rank", rankColWidths[0]),
    headerCell("Vendor", rankColWidths[1]),
    headerCell("Platform Type", rankColWidths[2]),
    headerCell("Overall Fit Score", rankColWidths[3]),
    headerCell("Assessment", rankColWidths[4]),
  ]
});

const rankRows = [rankHeaderRow];
vendorResults.forEach((v, i) => {
  const sc = scoreColor(v.overallScore);
  const isAlt = i % 2 === 1;
  rankRows.push(new TableRow({
    children: [
      dataCell(`#${i + 1}`, rankColWidths[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(v.vendorName, rankColWidths[1], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell((v.vendorShortName || "").includes("maximo") || (v.vendorShortName || "").includes("nv5") || (v.vendorShortName || "").includes("oracle_eam") ? "EAM" : "ERP", rankColWidths[2], { fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(`${v.overallScore}%`, rankColWidths[3], { bold: true, color: sc, fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(scoreAssessment(v.overallScore), rankColWidths[4], { fill: isAlt ? LIGHT_GRAY : WHITE }),
    ]
  }));
});

children.push(new Table({
  width: { size: CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: rankColWidths,
  rows: rankRows,
}));

// ===== MODULE SCORES =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Module-Level Comparison", bold: true, color: NAVY, font: "Arial", size: 36 })]
}));
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
  spacing: { after: 300 },
  children: []
}));

// Build module list grouped by category
const categories = {};
vendorResults.forEach(v => {
  Object.values(v.moduleScores).forEach(ms => {
    const cat = ms.category || "Other";
    if (!categories[cat]) categories[cat] = new Set();
    categories[cat].add(ms.functionalArea);
  });
});

// Module table
const vendorNames = vendorResults.map(v => v.vendorShortName.length > 8 ? v.vendorShortName.substring(0, 8) : v.vendorShortName);
const modColWidths = [2800, 600];
const vendorColWidth = Math.floor((CONTENT_WIDTH - 2800 - 600) / vendorResults.length);
vendorResults.forEach(() => modColWidths.push(vendorColWidth));

const modHeaderRow = new TableRow({
  children: [
    headerCell("Module", modColWidths[0]),
    headerCell("Wt.", modColWidths[1]),
    ...vendorNames.map((vn, i) => headerCell(vn, modColWidths[i + 2])),
  ]
});

const modRows = [modHeaderRow];
const catOrder = Object.keys(categories).sort();

catOrder.forEach(cat => {
  // Category header row
  modRows.push(new TableRow({
    children: [
      new TableCell({
        borders: allBorders,
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnSpan: modColWidths.length,
        shading: { fill: "2a3a5c", type: ShadingType.CLEAR },
        margins: cellMargins(),
        children: [new Paragraph({
          children: [new TextRun({ text: cat.toUpperCase(), bold: true, color: WHITE, font: "Arial", size: 16 })]
        })]
      }),
    ]
  }));

  const modules = Array.from(categories[cat]).sort();
  modules.forEach((mod, mi) => {
    const weight = moduleWeights[mod] || 5;
    const isAlt = mi % 2 === 1;
    const cells = [
      dataCell(mod, modColWidths[0], { fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(String(weight), modColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
    ];

    vendorResults.forEach((v, vi) => {
      const ms = v.moduleScores[mod];
      const score = ms ? ms.score : 0;
      const scoreStr = score > 0 ? `${Math.round(score)}%` : "—";
      const clr = score > 0 ? scoreColor(score) : "BBBBBB";
      cells.push(dataCell(scoreStr, modColWidths[vi + 2], { color: clr, bold: score > 0, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }));
    });

    modRows.push(new TableRow({ children: cells }));
  });
});

children.push(new Table({
  width: { size: CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: modColWidths,
  rows: modRows,
}));

// ===== GAP ANALYSIS =====
const critGaps = gaps.filter(g => g.criticality === "Critical");
if (critGaps.length > 0) {
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [new TextRun({ text: "Gap Analysis — Critical Requirements", bold: true, color: NAVY, font: "Arial", size: 36 })]
  }));
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
    spacing: { after: 200 },
    children: []
  }));
  children.push(new Paragraph({
    spacing: { after: 300 },
    children: [new TextRun({ text: `The following ${critGaps.length} critical requirements have one or more vendors scoring T (Third Party) or N (Not Supported). These represent areas of significant risk.`, font: "Arial", size: 20, color: "666666" })]
  }));

  // Group by module, max 10 per module
  const gapByMod = {};
  critGaps.forEach(g => {
    if (!gapByMod[g.functionalArea]) gapByMod[g.functionalArea] = [];
    gapByMod[g.functionalArea].push(g);
  });

  Object.keys(gapByMod).sort().forEach(mod => {
    const modGaps = gapByMod[mod].slice(0, 10);
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 150 },
      children: [new TextRun({ text: mod, bold: true, color: NAVY, font: "Arial", size: 24 })]
    }));

    const gapColWidths = [800, 3200];
    const gapVendorWidth = Math.floor((CONTENT_WIDTH - 4000) / vendorResults.length);
    vendorResults.forEach(() => gapColWidths.push(gapVendorWidth));

    const gapHeaderRow = new TableRow({
      children: [
        headerCell("Req #", gapColWidths[0]),
        headerCell("Description", gapColWidths[1]),
        ...vendorNames.map((vn, i) => headerCell(vn, gapColWidths[i + 2])),
      ]
    });

    const gapRows = [gapHeaderRow];
    modGaps.forEach((g, gi) => {
      const isAlt = gi % 2 === 1;
      const desc = g.description.length > 80 ? g.description.substring(0, 80) + "…" : g.description;
      const cells = [
        dataCell(g.reqNumber, gapColWidths[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
        dataCell(desc, gapColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE }),
      ];
      vendorResults.forEach((v, vi) => {
        const code = g.scores[v.vendorId] || "—";
        cells.push(dataCell(code, gapColWidths[vi + 2], { color: responseColor(code), bold: true, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }));
      });
      gapRows.push(new TableRow({ children: cells }));
    });

    children.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: gapColWidths,
      rows: gapRows,
    }));
  });
}

// ===== VENDOR PROFILES =====
if (allVendors && allVendors.length > 0) {
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [new TextRun({ text: "Vendor Profiles", bold: true, color: NAVY, font: "Arial", size: 36 })]
  }));
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
    spacing: { after: 300 },
    children: []
  }));

  allVendors.forEach(v => {
    const vColor = (v.color || NAVY).replace('#', '');
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: vColor } },
      spacing: { before: 300, after: 100 },
      children: [
        new TextRun({ text: v.name, bold: true, color: NAVY, font: "Arial", size: 26 }),
        new TextRun({ text: `  [${v.platformType ? v.platformType.toUpperCase() : 'ERP'}]`, color: "888888", font: "Arial", size: 18 }),
      ]
    }));
    children.push(new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: v.description || "", color: "666666", font: "Arial", size: 18 })]
    }));

    // Strengths
    const strengths = Array.isArray(v.strengths) ? v.strengths : (typeof v.strengths === 'string' ? JSON.parse(v.strengths) : []);
    if (strengths.length > 0) {
      children.push(new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [new TextRun({ text: "Strengths", bold: true, color: GREEN, font: "Arial", size: 20 })]
      }));
      strengths.forEach(s => {
        children.push(new Paragraph({
          spacing: { after: 40 },
          indent: { left: 360 },
          children: [new TextRun({ text: `• ${s}`, font: "Arial", size: 18, color: "444444" })]
        }));
      });
    }

    // Weaknesses
    const weaknesses = Array.isArray(v.weaknesses) ? v.weaknesses : (typeof v.weaknesses === 'string' ? JSON.parse(v.weaknesses) : []);
    if (weaknesses.length > 0) {
      children.push(new Paragraph({
        spacing: { before: 100, after: 60 },
        children: [new TextRun({ text: "Weaknesses", bold: true, color: RED, font: "Arial", size: 20 })]
      }));
      weaknesses.forEach(w => {
        children.push(new Paragraph({
          spacing: { after: 40 },
          indent: { left: 360 },
          children: [new TextRun({ text: `• ${w}`, font: "Arial", size: 18, color: "444444" })]
        }));
      });
    }
  });
}

// ===== METHODOLOGY =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { after: 200 },
  children: [new TextRun({ text: "Evaluation Methodology", bold: true, color: NAVY, font: "Arial", size: 36 })]
}));
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
  spacing: { after: 300 },
  children: []
}));

children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Vendor responses to each requirement are scored on a 5-point scale:", font: "Arial", size: 20, color: "444444" })] }));

const methodData = [
  ["S — Standard", "5", "Feature included in current release"],
  ["F — Future", "4", "On vendor roadmap, expected within 12 months"],
  ["C — Customization", "3", "Achievable with configuration or customization"],
  ["T — Third Party", "2", "Requires partner solution or integration"],
  ["N — Not Supported", "0", "Cannot meet this requirement"],
];

const methColWidths = [2500, 1000, 6580];
const methRows = [
  new TableRow({ children: [headerCell("Response", methColWidths[0]), headerCell("Score", methColWidths[1]), headerCell("Definition", methColWidths[2])] }),
  ...methodData.map((row, i) => new TableRow({
    children: row.map((cell, ci) => dataCell(cell, methColWidths[ci], { fill: i % 2 === 1 ? LIGHT_GRAY : WHITE, bold: ci === 0 }))
  }))
];

children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: methColWidths, rows: methRows }));

children.push(new Paragraph({ spacing: { before: 300, after: 100 }, children: [new TextRun({ text: "Weighting Rules:", bold: true, font: "Arial", size: 20, color: NAVY })] }));
children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [new TextRun({ text: "• Critical requirements are weighted 1.5× in the scoring calculation", font: "Arial", size: 18, color: "444444" })] }));
children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [new TextRun({ text: "• Desired requirements are weighted 1.0×", font: "Arial", size: 18, color: "444444" })] }));
children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [new TextRun({ text: "• Requirements marked 'Not Required' or 'Not Applicable' are excluded from scoring", font: "Arial", size: 18, color: "444444" })] }));
children.push(new Paragraph({ spacing: { after: 60 }, indent: { left: 360 }, children: [new TextRun({ text: "• Module weights are configurable (0-10 scale) and affect the overall fit score proportionally", font: "Arial", size: 18, color: "444444" })] }));

// Build document
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 220, after: 110 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: 15840 },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GOLD } },
            children: [
              new TextRun({ text: "Avero Caliber", bold: true, color: NAVY, font: "Arial", size: 16 }),
              new TextRun({ text: "                                                                              " }),
              new TextRun({ text: projectName || "", color: "888888", font: "Arial", size: 16 }),
            ]
          }),
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", font: "Arial", size: 16, color: "888888" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" }),
              new TextRun({ text: "     |     CONFIDENTIAL", font: "Arial", size: 16, color: "888888" }),
            ]
          })
        ]
      })
    },
    children,
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log(`Written ${buf.length} bytes to ${outputPath}`);
}).catch(err => {
  console.error("DOCX generation failed:", err);
  process.exit(1);
});
