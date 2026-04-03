// Vendor Comparison Report — DOCX Generator
// Usage: node generate-comparison-docx.cjs <input.json> <output.docx>

const fs = require('fs');
const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
} = docx;

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node generate-comparison-docx.cjs <input.json> <output.docx>");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const project = data.project || {};
const projectName = project.name || "Vendor Comparison";
const evalData = data.evaluation || {};
const vendorResults = evalData.vendors || [];
const gaps = evalData.gaps || [];
const moduleWeights = (data.weights || {}).moduleWeights || {};
const allVendors = data.allVendors || [];
const customCriteria = data.customCriteria || [];
const costs = data.costs || [];
const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// Colors
const NAVY = "1a2744";
const GOLD = "d4a853";
const GREEN = "22c55e";
const RED = "ef4444";
const LIGHT_GRAY = "F5F5F5";
const MED_GRAY = "E0E0E0";
const WHITE = "FFFFFF";
const LIGHT_NAVY = "253560";

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: MED_GRAY };
const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const PAGE_WIDTH = 12240;
const MARGIN = 1080;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

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
  switch (code) {
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

function catCell(text, colSpan) {
  return new TableCell({
    borders: allBorders,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnSpan: colSpan,
    shading: { fill: LIGHT_NAVY, type: ShadingType.CLEAR },
    margins: cellMargins(),
    children: [new Paragraph({
      children: [new TextRun({ text: text.toUpperCase(), bold: true, color: WHITE, font: "Arial", size: 16 })]
    })]
  });
}

function sectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
    children: [new TextRun({ text, bold: true, color: NAVY, font: "Arial", size: 36 })]
  });
}

function goldRule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
    spacing: { after: 300 },
    children: []
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, font: "Arial", size: 20, color: "444444" })]
  });
}

function bulletItem(text) {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [new TextRun({ text: `• ${text}`, font: "Arial", size: 18, color: "444444" })]
  });
}

// Build sections
const children = [];

// ===== COVER PAGE =====
for (let i = 0; i < 3; i++) children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
  spacing: { after: 400 }, children: []
}));
children.push(new Paragraph({
  spacing: { after: 200 },
  children: [new TextRun({ text: "Vendor Comparison Report", bold: true, color: NAVY, font: "Arial", size: 56 })]
}));
children.push(new Paragraph({
  spacing: { after: 400 },
  children: [new TextRun({ text: projectName, color: "666666", font: "Arial", size: 32 })]
}));
children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Prepared by: Avero Caliber`, color: NAVY, font: "Arial", size: 22 })] }));
children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Date: ${today}`, color: NAVY, font: "Arial", size: 22 })] }));
children.push(new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: `Vendors Evaluated: ${vendorResults.length}`, color: NAVY, font: "Arial", size: 22 })] }));
children.push(new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD } },
  spacing: { after: 300 }, children: []
}));
children.push(new Paragraph({
  spacing: { after: 200 },
  children: [new TextRun({ text: "This document contains confidential and proprietary information prepared exclusively for the use of the named client.", italics: true, color: "999999", font: "Arial", size: 16 })]
}));

// ===== 1. EXECUTIVE SUMMARY =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("1. Executive Summary"));
children.push(goldRule());

const moduleCount = new Set();
vendorResults.forEach(v => Object.keys(v.moduleScores).forEach(m => moduleCount.add(m)));
const top = vendorResults[0];
const second = vendorResults.length > 1 ? vendorResults[1] : null;
const third = vendorResults.length > 2 ? vendorResults[2] : null;

let totalReqs = 0;
if (top) {
  Object.values(top.moduleScores).forEach(ms => { totalReqs += ms.requirementCount || 0; });
}

let summary = `${vendorResults.length} vendors were evaluated against ${totalReqs} requirements across ${moduleCount.size} functional modules. `;
if (top) summary += `${top.vendorName} achieved the highest overall fit score at ${top.overallScore.toFixed ? top.overallScore.toFixed(1) : top.overallScore}%`;
if (second) summary += `, followed by ${second.vendorName} at ${second.overallScore.toFixed ? second.overallScore.toFixed(1) : second.overallScore}%`;
if (third) summary += ` and ${third.vendorName} at ${third.overallScore.toFixed ? third.overallScore.toFixed(1) : third.overallScore}%`;
summary += ".";

children.push(bodyText(summary));

// Key differentiators
if (vendorResults.length >= 2) {
  children.push(new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: "Key Differentiators", bold: true, color: NAVY, font: "Arial", size: 24 })]
  }));
  vendorResults.slice(0, 3).forEach(v => {
    const info = allVendors.find(av => av.id === v.vendorId) || {};
    const strengths = Array.isArray(info.strengths) ? info.strengths : (typeof info.strengths === 'string' ? (() => { try { return JSON.parse(info.strengths); } catch { return []; } })() : []);
    const topStr = strengths[0] || "N/A";
    children.push(bulletItem(`${v.vendorName} (${v.overallScore.toFixed ? v.overallScore.toFixed(1) : v.overallScore}%): ${topStr}`));
  });
}

// Recommendation
children.push(new Paragraph({
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text: "Recommendation", bold: true, color: NAVY, font: "Arial", size: 24 })]
}));
if (top && top.overallScore >= 80) {
  children.push(bodyText(`${top.vendorName} demonstrates a strong overall fit and is recommended as the primary candidate for further evaluation and negotiation.`));
} else if (top && top.overallScore >= 60) {
  children.push(bodyText(`${top.vendorName} shows a moderate fit. Further evaluation of specific module gaps is recommended before proceeding.`));
} else {
  children.push(bodyText("No vendor achieved a strong fit score. A review of requirements or additional vendor evaluation may be necessary."));
}

// ===== 2. METHODOLOGY =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("2. Methodology"));
children.push(goldRule());
children.push(bodyText("Vendor responses to each requirement are scored on a 5-point scale:"));

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

if (customCriteria.length > 0) {
  children.push(new Paragraph({
    spacing: { before: 300, after: 100 },
    children: [new TextRun({ text: "Custom Criteria", bold: true, color: NAVY, font: "Arial", size: 24 })]
  }));
  children.push(bodyText(`${customCriteria.length} custom evaluation criteria were scored on a 1–10 scale:`));
  customCriteria.forEach(c => {
    children.push(bulletItem(`${c.name} (Weight: ${c.weight}/10)${c.description ? ': ' + c.description : ''}`));
  });
}

// ===== 3. OVERALL RANKINGS =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("3. Overall Rankings"));
children.push(goldRule());

const rankColWidths = [700, 2200, 1200, 1800, 1600, 2580];
const rankHeaderRow = new TableRow({
  children: [
    headerCell("Rank", rankColWidths[0]),
    headerCell("Vendor", rankColWidths[1]),
    headerCell("Type", rankColWidths[2]),
    headerCell("Score", rankColWidths[3]),
    headerCell("Assessment", rankColWidths[4]),
    headerCell("Key Strength", rankColWidths[5]),
  ]
});
const rankRows = [rankHeaderRow];
vendorResults.forEach((v, i) => {
  const sc = scoreColor(v.overallScore);
  const isAlt = i % 2 === 1;
  const info = allVendors.find(av => av.id === v.vendorId) || {};
  const ptype = (info.platformType || "erp").toUpperCase();
  const strengths = Array.isArray(info.strengths) ? info.strengths : [];
  const topStr = strengths.length > 0 ? (strengths[0].length > 35 ? strengths[0].substring(0, 35) + "…" : strengths[0]) : "—";
  rankRows.push(new TableRow({
    children: [
      dataCell(`#${i + 1}`, rankColWidths[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(v.vendorName, rankColWidths[1], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(ptype, rankColWidths[2], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(`${v.overallScore.toFixed ? v.overallScore.toFixed(1) : v.overallScore}%`, rankColWidths[3], { bold: true, color: sc, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(scoreAssessment(v.overallScore), rankColWidths[4], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(topStr, rankColWidths[5], { fill: isAlt ? LIGHT_GRAY : WHITE }),
    ]
  }));
});
children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: rankColWidths, rows: rankRows }));

// ===== 4. COST ANALYSIS =====
if (costs.length > 0) {
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("4. Cost Analysis"));
  children.push(goldRule());

  const costColWidths = [2500, 2527, 2527, 2526];
  const costHeader = new TableRow({
    children: [
      headerCell("Vendor", costColWidths[0]),
      headerCell("Implementation", costColWidths[1]),
      headerCell("Annual", costColWidths[2]),
      headerCell("7-Year TCO", costColWidths[3]),
    ]
  });
  const costRows = [costHeader];
  const lowestTCO = Math.min(...costs.filter(c => c.sevenYearTotal > 0).map(c => c.sevenYearTotal));

  costs.forEach((c, i) => {
    const isAlt = i % 2 === 1;
    const isLowest = c.sevenYearTotal > 0 && c.sevenYearTotal === lowestTCO;
    const name = isLowest ? `★ ${c.vendorName}` : c.vendorName;
    costRows.push(new TableRow({
      children: [
        dataCell(name, costColWidths[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
        dataCell(`$${(c.implementationTotal || 0).toLocaleString()}`, costColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
        dataCell(`$${(c.ongoingAnnual || 0).toLocaleString()}`, costColWidths[2], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
        dataCell(`$${(c.sevenYearTotal || 0).toLocaleString()}`, costColWidths[3], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      ]
    }));
  });
  children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: costColWidths, rows: costRows }));
}

// ===== 5. MODULE COMPARISON =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("5. Module-by-Module Comparison"));
children.push(goldRule());

const vendorNames = vendorResults.map(v => v.vendorShortName && v.vendorShortName.length > 8 ? v.vendorShortName.substring(0, 8) : (v.vendorShortName || v.vendorName.substring(0, 8)));
const categories = {};
vendorResults.forEach(v => {
  Object.entries(v.moduleScores).forEach(([mod, ms]) => {
    const cat = ms.category || "Other";
    if (!categories[cat]) categories[cat] = new Set();
    categories[cat].add(mod);
  });
});

const modColWidths = [2400, 500, 500];
const vendorColWidth = Math.floor((CONTENT_WIDTH - 3400) / Math.max(vendorResults.length, 1));
vendorResults.forEach(() => modColWidths.push(vendorColWidth));
const totalModCols = modColWidths.length;

const modHeaderRow = new TableRow({
  children: [
    headerCell("Module", modColWidths[0]),
    headerCell("Wt", modColWidths[1]),
    headerCell("Reqs", modColWidths[2]),
    ...vendorNames.map((vn, i) => headerCell(vn, modColWidths[i + 3])),
  ]
});
const modRows = [modHeaderRow];

Object.keys(categories).sort().forEach(cat => {
  modRows.push(new TableRow({ children: [catCell(cat, totalModCols)] }));
  const modules = Array.from(categories[cat]).sort();
  modules.forEach((mod, mi) => {
    const weight = moduleWeights[mod] || 5;
    const isAlt = mi % 2 === 1;
    const reqCount = vendorResults[0] && vendorResults[0].moduleScores[mod] ? vendorResults[0].moduleScores[mod].requirementCount || 0 : 0;
    const cells = [
      dataCell(mod, modColWidths[0], { fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(String(weight), modColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(String(reqCount), modColWidths[2], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
    ];
    vendorResults.forEach((v, vi) => {
      const ms = v.moduleScores[mod];
      const score = ms ? ms.score : 0;
      const scoreStr = score > 0 ? `${Math.round(score)}%` : "—";
      const clr = score > 0 ? scoreColor(score) : "BBBBBB";
      cells.push(dataCell(scoreStr, modColWidths[vi + 3], { color: clr, bold: score > 0, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }));
    });
    modRows.push(new TableRow({ children: cells }));
  });
});

children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: modColWidths, rows: modRows }));

// ===== 6. GAP ANALYSIS =====
const critGaps = gaps.filter(g => g.criticality === "Critical");
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("6. Gap Analysis Summary"));
children.push(goldRule());

children.push(bodyText(`Total gaps identified: ${gaps.length}`));
children.push(bodyText(`Critical gaps: ${critGaps.length}`));

// Gaps per vendor table
const vendorIds = vendorResults.map(v => v.vendorId);
const vendorShortNames = {};
vendorResults.forEach(v => { vendorShortNames[v.vendorId] = v.vendorShortName || v.vendorName.substring(0, 8); });

const vGapCounts = {};
const vCritGapCounts = {};
vendorIds.forEach(vid => { vGapCounts[vid] = 0; vCritGapCounts[vid] = 0; });
gaps.forEach(g => {
  const scores = g.scores || {};
  vendorIds.forEach(vid => {
    const s = scores[vid] || scores[String(vid)] || "";
    if (s === "T" || s === "N") {
      vGapCounts[vid]++;
      if (g.criticality === "Critical") vCritGapCounts[vid]++;
    }
  });
});

const gapSumColWidths = [3360, 3360, 3360];
const gapSumHeader = new TableRow({ children: [headerCell("Vendor", gapSumColWidths[0]), headerCell("Total Gaps", gapSumColWidths[1]), headerCell("Critical Gaps", gapSumColWidths[2])] });
const gapSumRows = [gapSumHeader];
vendorIds.forEach((vid, i) => {
  const isAlt = i % 2 === 1;
  gapSumRows.push(new TableRow({
    children: [
      dataCell(vendorShortNames[vid], gapSumColWidths[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(String(vGapCounts[vid]), gapSumColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(String(vCritGapCounts[vid]), gapSumColWidths[2], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
    ]
  }));
});
children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: gapSumColWidths, rows: gapSumRows }));

// Critical gap details
if (critGaps.length > 0) {
  children.push(new Paragraph({
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text: "Critical Gap Details (Top 15)", bold: true, color: NAVY, font: "Arial", size: 24 })]
  }));

  const shown = critGaps.slice(0, 15);
  const gapColWidths2 = [700, 1400, 2000];
  const gapVW = Math.floor((CONTENT_WIDTH - 4100) / Math.max(vendorResults.length, 1));
  vendorResults.forEach(() => gapColWidths2.push(gapVW));

  const gapHeaderRow2 = new TableRow({
    children: [
      headerCell("Req #", gapColWidths2[0]),
      headerCell("Module", gapColWidths2[1]),
      headerCell("Description", gapColWidths2[2]),
      ...vendorNames.map((vn, i) => headerCell(vn, gapColWidths2[i + 3])),
    ]
  });
  const gapRows2 = [gapHeaderRow2];

  shown.forEach((g, gi) => {
    const isAlt = gi % 2 === 1;
    const desc = g.description && g.description.length > 50 ? g.description.substring(0, 50) + "…" : (g.description || "");
    const cells = [
      dataCell(g.reqNumber || "", gapColWidths2[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      dataCell(g.functionalArea || "", gapColWidths2[1], { fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(desc, gapColWidths2[2], { fill: isAlt ? LIGHT_GRAY : WHITE }),
    ];
    vendorResults.forEach((v, vi) => {
      const code = (g.scores || {})[v.vendorId] || (g.scores || {})[String(v.vendorId)] || "—";
      cells.push(dataCell(code, gapColWidths2[vi + 3], { color: responseColor(code), bold: true, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }));
    });
    gapRows2.push(new TableRow({ children: cells }));
  });
  children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: gapColWidths2, rows: gapRows2 }));
}

// ===== 7. CUSTOM CRITERIA =====
if (customCriteria.length > 0) {
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(sectionTitle("7. Custom Criteria Scores"));
  children.push(goldRule());

  const ccColWidths = [2200, 500];
  const ccVW = Math.floor((CONTENT_WIDTH - 2700) / Math.max(vendorIds.length, 1));
  vendorIds.forEach(() => ccColWidths.push(ccVW));

  const ccHeader = new TableRow({
    children: [
      headerCell("Criterion", ccColWidths[0]),
      headerCell("Wt", ccColWidths[1]),
      ...vendorIds.map((vid, i) => headerCell(vendorShortNames[vid] || "?", ccColWidths[i + 2])),
    ]
  });
  const ccRows = [ccHeader];

  customCriteria.forEach((c, ci) => {
    const isAlt = ci % 2 === 1;
    const scoreMap = {};
    (c.scores || []).forEach(s => { scoreMap[s.vendorId] = s.score; });
    const cells = [
      dataCell(c.name, ccColWidths[0], { bold: true, fill: isAlt ? LIGHT_GRAY : WHITE }),
      dataCell(String(c.weight || 5), ccColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
    ];
    vendorIds.forEach((vid, vi) => {
      const s = scoreMap[vid] || 0;
      const clr = s >= 8 ? GREEN : (s >= 5 ? GOLD : (s > 0 ? RED : "BBBBBB"));
      cells.push(dataCell(s > 0 ? String(s) : "—", ccColWidths[vi + 2], { bold: s > 0, color: clr, fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }));
    });
    ccRows.push(new TableRow({ children: cells }));
  });
  children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: ccColWidths, rows: ccRows }));
}

// ===== 8. VENDOR PROFILES =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("8. Vendor Profiles"));
children.push(goldRule());

vendorResults.forEach(v => {
  const info = allVendors.find(av => av.id === v.vendorId) || {};
  const vColor = (v.color || NAVY).replace('#', '');

  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: vColor } },
    spacing: { before: 300, after: 100 },
    children: [
      new TextRun({ text: v.vendorName, bold: true, color: NAVY, font: "Arial", size: 26 }),
      new TextRun({ text: `  [${(info.platformType || 'erp').toUpperCase()}]  `, color: "888888", font: "Arial", size: 18 }),
      new TextRun({ text: `Score: ${v.overallScore.toFixed ? v.overallScore.toFixed(1) : v.overallScore}%`, bold: true, color: scoreColor(v.overallScore), font: "Arial", size: 20 }),
    ]
  }));

  if (info.description) {
    children.push(new Paragraph({
      spacing: { after: 150 },
      children: [new TextRun({ text: info.description, color: "666666", font: "Arial", size: 18 })]
    }));
  }

  const strengths = Array.isArray(info.strengths) ? info.strengths : (typeof info.strengths === 'string' ? (() => { try { return JSON.parse(info.strengths); } catch { return []; } })() : []);
  const weaknesses = Array.isArray(info.weaknesses) ? info.weaknesses : (typeof info.weaknesses === 'string' ? (() => { try { return JSON.parse(info.weaknesses); } catch { return []; } })() : []);

  if (strengths.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 100, after: 60 },
      children: [new TextRun({ text: "Strengths", bold: true, color: GREEN, font: "Arial", size: 20 })]
    }));
    strengths.forEach(s => children.push(bulletItem(s)));
  }

  if (weaknesses.length > 0) {
    children.push(new Paragraph({
      spacing: { before: 100, after: 60 },
      children: [new TextRun({ text: "Weaknesses", bold: true, color: RED, font: "Arial", size: 20 })]
    }));
    weaknesses.forEach(w => children.push(bulletItem(w)));
  }
});

// ===== APPENDIX =====
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(sectionTitle("Appendix: Weight Configuration"));
children.push(goldRule());

if (Object.keys(moduleWeights).length > 0) {
  const wtColWidths = [7580, 2500];
  const wtHeader = new TableRow({ children: [headerCell("Module", wtColWidths[0]), headerCell("Weight", wtColWidths[1])] });
  const wtRows = [wtHeader];
  Object.entries(moduleWeights).sort(([a], [b]) => a.localeCompare(b)).forEach(([mod, wt], i) => {
    const isAlt = i % 2 === 1;
    wtRows.push(new TableRow({
      children: [
        dataCell(mod, wtColWidths[0], { fill: isAlt ? LIGHT_GRAY : WHITE }),
        dataCell(String(wt), wtColWidths[1], { fill: isAlt ? LIGHT_GRAY : WHITE, align: AlignmentType.CENTER }),
      ]
    }));
  });
  children.push(new Table({ width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: wtColWidths, rows: wtRows }));
}

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
              new TextRun({ text: "Avero Caliber — Vendor Comparison Report", bold: true, color: NAVY, font: "Arial", size: 16 }),
              new TextRun({ text: "                                                      " }),
              new TextRun({ text: projectName, color: "888888", font: "Arial", size: 16 }),
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
