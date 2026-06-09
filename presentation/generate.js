const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Ritik, Hardik, Amar";
pres.title = "EDL Underwriting Co-Pilot — Slice 3.0 Hackathon";

// ── Color palette: Midnight Executive ──
const C = {
  navy: "1E2761",
  navyDark: "141C47",
  ice: "CADCFC",
  white: "FFFFFF",
  gray100: "F4F5F7",
  gray200: "E2E4EA",
  gray500: "6B7280",
  gray700: "374151",
  gray900: "111827",
  accent: "3B82F6",
  accentDark: "2563EB",
  green: "16A34A",
  greenBg: "DCFCE7",
  red: "DC2626",
  redBg: "FEE2E2",
  yellow: "F59E0B",
  yellowBg: "FEF3C7",
};

// ── Helpers ──
function darkSlide(slide) {
  slide.background = { color: C.navy };
}
function lightSlide(slide) {
  slide.background = { color: C.white };
  // Subtle left accent bar
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: 5.625, fill: { color: C.accent } });
}
function slideTitle(slide, title, opts = {}) {
  slide.addText(title, {
    x: 0.7, y: 0.35, w: 8.6, h: 0.55, fontSize: 28, fontFace: "Arial Black",
    color: opts.dark ? C.white : C.gray900, bold: true, margin: 0,
  });
}
function slideSubtitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: 0.7, y: 0.95, w: 8.6, h: 0.4, fontSize: 13, fontFace: "Calibri",
    color: opts.dark ? C.ice : C.gray500, italic: true, margin: 0,
  });
}
function cardBox(slide, x, y, w, h, fill = C.gray100) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, fill: { color: fill }, rectRadius: 0.08,
    shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 135, opacity: 0.08 },
  });
}
function statCard(slide, x, y, w, num, label, color = C.accent) {
  cardBox(slide, x, y, w, 0.9);
  slide.addText(num, { x, y: y + 0.08, w, h: 0.45, fontSize: 22, fontFace: "Arial Black", color, align: "center", margin: 0 });
  slide.addText(label, { x, y: y + 0.48, w, h: 0.35, fontSize: 9, fontFace: "Calibri", color: C.gray500, align: "center", margin: 0 });
}
function bulletList(slide, items, x, y, w, h, opts = {}) {
  const textItems = items.map((item, i) => ({
    text: item,
    options: { bullet: true, breakLine: i < items.length - 1, fontSize: opts.fontSize || 12, color: opts.color || C.gray700 },
  }));
  slide.addText(textItems, { x, y, w, h, fontFace: "Calibri", lineSpacingMultiple: 1.35, margin: 0 });
}
function pageNum(slide, num) {
  slide.addText(`${num}`, { x: 9.3, y: 5.25, w: 0.5, h: 0.3, fontSize: 9, color: C.gray500, align: "right", fontFace: "Calibri", margin: 0 });
}

// ══════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ══════════════════════════════════════════════════════════════════
let s1 = pres.addSlide();
darkSlide(s1);
// Large accent shape
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s1.addText("EDL UNDERWRITING", { x: 0.8, y: 1.2, w: 8.4, h: 0.7, fontSize: 40, fontFace: "Arial Black", color: C.white, margin: 0 });
s1.addText("CO-PILOT", { x: 0.8, y: 1.85, w: 8.4, h: 0.65, fontSize: 38, fontFace: "Arial Black", color: C.accent, margin: 0 });
s1.addText("Solve the parsing the vendor can't — and learn every format.", {
  x: 0.8, y: 2.7, w: 7, h: 0.4, fontSize: 16, fontFace: "Calibri", color: C.ice, italic: true, margin: 0,
});
s1.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 3.3, w: 2.5, h: 0.03, fill: { color: C.accent } });
s1.addText("Turns hours of CAM filling into a 15-min review", {
  x: 0.8, y: 3.5, w: 6, h: 0.35, fontSize: 13, fontFace: "Calibri", color: C.ice, margin: 0,
});
s1.addText("Slice 3.0 Hackathon  |  Team: Ritik, Hardik, Amar", {
  x: 0.8, y: 4.8, w: 8, h: 0.35, fontSize: 12, fontFace: "Calibri", color: C.gray500, margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 2 — THE PROBLEM
// ══════════════════════════════════════════════════════════════════
let s2 = pres.addSlide();
lightSlide(s2);
slideTitle(s2, "The Problem: Manual CAM is Broken");
slideSubtitle(s2, "CE emails docs → 70-sheet Excel filled by hand → hours of rework");
pageNum(s2, "2");

const problems = [
  { icon: "📧", title: "Manual Data Entry", desc: "CAM fields typed from emailed docs — hours/file, error-prone" },
  { icon: "🚫", title: "20% Unparseable PDFs", desc: "Bank statements vendor (Ignosis) can't read → 1-2 hr manual effort each" },
  { icon: "🔄", title: "CE↔CM Back-and-forth", desc: "Missing pre-PD documents → delays, re-requests mid-PD" },
  { icon: "⚠️", title: "Inconsistent Checks", desc: "Fraud/eligibility checks (CERSAI, dedupe, GST) — skippable, manual" },
  { icon: "🔁", title: "Income Re-derived", desc: "Obligation/turnover/ABB computed by hand every time" },
  { icon: "📊", title: "No Auditability", desc: "No trace of which data came from which document" },
];
problems.forEach((p, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 0.7 + col * 3.05;
  const y = 1.6 + row * 1.85;
  cardBox(s2, x, y, 2.85, 1.6);
  s2.addText(p.icon, { x: x + 0.15, y: y + 0.12, w: 0.4, h: 0.35, fontSize: 18, margin: 0 });
  s2.addText(p.title, { x: x + 0.55, y: y + 0.12, w: 2.1, h: 0.35, fontSize: 12, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s2.addText(p.desc, { x: x + 0.15, y: y + 0.55, w: 2.55, h: 0.9, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0, lineSpacingMultiple: 1.2 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 3 — SOLUTION
// ══════════════════════════════════════════════════════════════════
let s3 = pres.addSlide();
lightSlide(s3);
slideTitle(s3, "What We Built");
slideSubtitle(s3, "Auto-populate the CAM → run checks → editable review → export");
pageNum(s3, "3");

const flowSteps = ["Documents\n+ LOS", "Ingest &\nClassify", "Parse\nBank/GST/Bureau", "Tag\nEMI/Income/ABB", "JSON\nState", "Checks &\nEligibility", "Portal:\nReview", "CAM\nExport"];
flowSteps.forEach((step, i) => {
  const x = 0.35 + i * 1.18;
  const isHighlight = i === 4 || i === 6;
  cardBox(s3, x, 1.7, 1.05, 0.95, isHighlight ? "EBF5FF" : C.gray100);
  s3.addText(step, { x, y: 1.72, w: 1.05, h: 0.91, fontSize: 8.5, fontFace: "Calibri", color: isHighlight ? C.accentDark : C.gray700, align: "center", valign: "middle", bold: isHighlight, margin: 0 });
  if (i < flowSteps.length - 1) {
    s3.addText("→", { x: x + 1.02, y: 1.9, w: 0.2, h: 0.4, fontSize: 14, color: C.accent, align: "center", valign: "middle", margin: 0 });
  }
});

cardBox(s3, 0.7, 3.1, 8.6, 1.3, "EBF5FF");
s3.addText("Key Insight", { x: 0.9, y: 3.2, w: 2, h: 0.3, fontSize: 11, fontFace: "Arial", color: C.accentDark, bold: true, margin: 0 });
s3.addText("JSON is the source of truth; Excel is a populate-only compute target. We write only INPUT_ sheets; Logic_ formulas recompute on open. Zero formula rewriting.", {
  x: 0.9, y: 3.55, w: 8.2, h: 0.7, fontSize: 11, fontFace: "Calibri", color: C.gray700, margin: 0, lineSpacingMultiple: 1.3,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 4 — ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
let s4 = pres.addSlide();
lightSlide(s4);
slideTitle(s4, "Architecture: Reuse, Don't Rebuild");
slideSubtitle(s4, "The CAM's 3-layer model — we plug in, we don't replace");
pageNum(s4, "4");

const layers = [
  { label: "INPUT_ sheets (hidden)", desc: "Machine-fed, dotted JSON keys\n(applicantDetails.pan, udyamDetails.details.documentId)", color: C.accent, bg: "EBF5FF" },
  { label: "Logic_ sheets (hidden)", desc: "Existing underwriting formulas\nReused as-is, never rebuilt", color: C.yellow, bg: C.yellowBg },
  { label: "Presentation (33 visible)", desc: "What CE/CM read\nAuto-populated from Logic_ calculations", color: C.green, bg: C.greenBg },
];
layers.forEach((l, i) => {
  const y = 1.55 + i * 1.2;
  cardBox(s4, 0.7, y, 8.6, 1.0, l.bg);
  s4.addShape(pres.shapes.RECTANGLE, { x: 0.7, y, w: 0.08, h: 1.0, fill: { color: l.color } });
  s4.addText(`Layer ${i + 1}: ${l.label}`, { x: 1.0, y: y + 0.08, w: 4, h: 0.3, fontSize: 13, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s4.addText(l.desc, { x: 1.0, y: y + 0.4, w: 8, h: 0.5, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0, lineSpacingMultiple: 1.2 });
});

s4.addText("We write only INPUT_ sheets → Logic_ formulas recompute on open → Zero formula rewriting", {
  x: 0.7, y: 5.0, w: 8.6, h: 0.3, fontSize: 11, fontFace: "Calibri", color: C.accentDark, bold: true, align: "center", margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 5 — ROBUSTNESS
// ══════════════════════════════════════════════════════════════════
let s5 = pres.addSlide();
lightSlide(s5);
slideTitle(s5, "Two Engines: Rules + LLM");
slideSubtitle(s5, "Structure-based rules and LLM cover each other — and the LLM teaches the rules");
pageNum(s5, "5");

const rSteps = [
  { label: "Statement PDF", x: 0.7, y: 1.7, w: 1.6, bg: C.gray200 },
  { label: "Rule Extractor\n(archetype-aware)", x: 2.8, y: 1.7, w: 1.8, bg: "EBF5FF" },
  { label: "Balance\nreconciles ≥90%?", x: 5.1, y: 1.7, w: 1.6, bg: C.yellowBg },
  { label: "Accept\n(method=rule)", x: 7.2, y: 1.7, w: 1.6, bg: C.greenBg },
];
rSteps.forEach((s) => {
  cardBox(s5, s.x, s.y, s.w, 0.8, s.bg);
  s5.addText(s.label, { x: s.x, y: s.y, w: s.w, h: 0.8, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
});
["→", "→", "✓"].forEach((arrow, i) => {
  s5.addText(arrow, { x: [2.35, 4.65, 6.75][i], y: 1.85, w: 0.4, h: 0.4, fontSize: 14, color: C.accent, align: "center", margin: 0 });
});

// LLM path
cardBox(s5, 2.8, 2.9, 1.8, 0.7, "FEF3C7");
s5.addText("LLM maps\nheader → roles", { x: 2.8, y: 2.9, w: 1.8, h: 0.7, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
cardBox(s5, 5.1, 2.9, 1.6, 0.7, "EBF5FF");
s5.addText("Save learned\nprofile", { x: 5.1, y: 2.9, w: 1.6, h: 0.7, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
cardBox(s5, 7.2, 2.9, 1.6, 0.7, C.greenBg);
s5.addText("Accept\n(method=learned)", { x: 7.2, y: 2.9, w: 1.6, h: 0.7, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
s5.addText("↓ new format", { x: 4.45, y: 2.55, w: 1.2, h: 0.3, fontSize: 8, color: C.red, align: "center", margin: 0 });
["→", "→"].forEach((a, i) => {
  s5.addText(a, { x: [4.65, 6.75][i], y: 3.05, w: 0.4, h: 0.4, fontSize: 14, color: C.yellow, align: "center", margin: 0 });
});

cardBox(s5, 0.7, 4.0, 8.6, 0.8, "EBF5FF");
s5.addText("KPI: \"served-by\" metric", { x: 0.9, y: 4.08, w: 3, h: 0.25, fontSize: 11, fontFace: "Arial", color: C.accentDark, bold: true, margin: 0 });
s5.addText("Tracks rule vs LLM usage per case. LLM dependency decreases over time as learned profiles accumulate. Each new format = one-time LLM cost.", {
  x: 0.9, y: 4.35, w: 8.2, h: 0.35, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 6 — FUNCTIONALITIES
// ══════════════════════════════════════════════════════════════════
let s6 = pres.addSlide();
lightSlide(s6);
slideTitle(s6, "What It Does");
pageNum(s6, "6");

const features = [
  { icon: "⚡", title: "Auto-fill CAM", desc: "Documents → CAM fields, no manual entry" },
  { icon: "🔓", title: "Parse the 20%", desc: "Bilingual, cooperative, non-standard banks" },
  { icon: "🏦", title: "Banking Features", desc: "Income, EMI (250 lenders), ABB, bounces" },
  { icon: "📋", title: "GST Turnover", desc: "GSTR-3B → annual turnover (<0.5% accurate)" },
  { icon: "🔍", title: "Automated Checks", desc: "Dedupe, GSTIN, name match, completeness" },
  { icon: "📊", title: "Eligibility Engine", desc: "Banking program + deviation calculation" },
  { icon: "✏️", title: "Editable Review", desc: "Every field editable, changes persisted" },
  { icon: "🎯", title: "Learning Harness", desc: "CAM-as-ground-truth, learns per case" },
];
features.forEach((f, i) => {
  const col = i % 4;
  const row = Math.floor(i / 4);
  const x = 0.5 + col * 2.35;
  const y = 1.35 + row * 2.0;
  cardBox(s6, x, y, 2.15, 1.7);
  s6.addText(f.icon, { x: x + 0.1, y: y + 0.1, w: 0.4, h: 0.35, fontSize: 20, margin: 0 });
  s6.addText(f.title, { x: x + 0.1, y: y + 0.5, w: 1.95, h: 0.3, fontSize: 11, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s6.addText(f.desc, { x: x + 0.1, y: y + 0.85, w: 1.95, h: 0.7, fontSize: 9.5, fontFace: "Calibri", color: C.gray500, margin: 0, lineSpacingMultiple: 1.2 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 7 — EDIT FEATURE
// ══════════════════════════════════════════════════════════════════
let s7 = pres.addSlide();
darkSlide(s7);
slideTitle(s7, "Why Underwriters Still Use Excel", { dark: true });
slideSubtitle(s7, "...and how we match it", { dark: true });
pageNum(s7, "7");
s7.addText("7", { x: 9.3, y: 5.25, w: 0.5, h: 0.3, fontSize: 9, color: C.gray500, align: "right", fontFace: "Calibri", margin: 0 });

s7.addText("The ONE reason: EDITABILITY", { x: 0.8, y: 1.6, w: 8, h: 0.4, fontSize: 20, fontFace: "Arial Black", color: C.yellow, margin: 0 });
s7.addText("An underwriter can override any cell in Excel. That's the only reason they stay.", {
  x: 0.8, y: 2.1, w: 8, h: 0.35, fontSize: 13, fontFace: "Calibri", color: C.ice, margin: 0,
});

// Yellow vs Grey cards
cardBox(s7, 0.8, 2.8, 4, 1.2, "423A06");
s7.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 2.8, w: 0.08, h: 1.2, fill: { color: C.yellow } });
s7.addText("Yellow Fields", { x: 1.1, y: 2.9, w: 3.5, h: 0.3, fontSize: 14, fontFace: "Arial", color: C.yellow, bold: true, margin: 0 });
s7.addText("Editable by underwriter\nEdit → Update → persisted\nHuman edits locked against re-parse", {
  x: 1.1, y: 3.25, w: 3.5, h: 0.65, fontSize: 10, fontFace: "Calibri", color: C.ice, margin: 0, lineSpacingMultiple: 1.3,
});

cardBox(s7, 5.2, 2.8, 4, 1.2, "1A2040");
s7.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 2.8, w: 0.08, h: 1.2, fill: { color: C.gray500 } });
s7.addText("Grey Fields", { x: 5.5, y: 2.9, w: 3.5, h: 0.3, fontSize: 14, fontFace: "Arial", color: C.gray200, bold: true, margin: 0 });
s7.addText("Auto-populated from APIs/docs\nRead-only, source-tracked\nAudit trail maintained", {
  x: 5.5, y: 3.25, w: 3.5, h: 0.65, fontSize: 10, fontFace: "Calibri", color: C.ice, margin: 0, lineSpacingMultiple: 1.3,
});

s7.addText("This removes the last reason to stay in Excel.", {
  x: 0.8, y: 4.4, w: 8.4, h: 0.35, fontSize: 16, fontFace: "Arial Black", color: C.white, align: "center", margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 8 — RESULTS
// ══════════════════════════════════════════════════════════════════
let s8 = pres.addSlide();
lightSlide(s8);
slideTitle(s8, "Results: 11 Real CAM Cases");
slideSubtitle(s8, "Ground truth = the CAM itself (turnover, identity, income already verified)");
pageNum(s8, "8");

const tableRows = [
  ["Metric", "Result"],
  ["Exact-scored fields (GSTIN, PAN, name, amount, turnover)", "41/41 (100%)"],
  ["GST annual turnover accuracy", "<0.5% variance"],
  ["SBI statement (new format)", "0 → 1,530 txns @ 100%"],
  ["Single-Amount bank (Ramya)", "0% → 100% (1,844 txns)"],
  ["BOB cooperative (vendor-unparseable)", "12/16 @ 100%"],
  ["Loan statement misclassified as bank", "Correctly excluded"],
];
s8.addTable(tableRows, {
  x: 0.7, y: 1.55, w: 8.6,
  border: { type: "solid", pt: 0.5, color: C.gray200 },
  colW: [5.8, 2.8],
  rowH: [0.35, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
  fontSize: 11,
  fontFace: "Calibri",
  color: C.gray700,
  autoPage: false,
  headerRow: true,
});

// Stat callouts
statCard(s8, 1.2, 4.5, 2.2, "100%", "Exact Match Rate", C.green);
statCard(s8, 4.0, 4.5, 2.2, "<0.5%", "GST Variance", C.accent);
statCard(s8, 6.8, 4.5, 2.2, "1,530", "SBI Txns Parsed", C.accentDark);

// ══════════════════════════════════════════════════════════════════
// SLIDE 9 — ITERATIVE LEARNING
// ══════════════════════════════════════════════════════════════════
let s9 = pres.addSlide();
lightSlide(s9);
slideTitle(s9, "The Differentiator: Gets Smarter Every Case");
pageNum(s9, "9");

const learnings = [
  { phase: "Case 1 (Aakash)", detail: "Established harness; parsed BOB bilingual the vendor can't; password auto-recovery unlocked ICICI statement", color: C.accent },
  { phase: "Cohort Fix", detail: "One GSTIN seed from LOS lifted 4 cases at once: 90% → 100%. Lesson: identity from LOS, parsing for financials.", color: C.green },
  { phase: "P0 Generalization", detail: "Two archetypes discovered, money-vs-date bug fixed, content-based classification replaced filename-based.", color: C.yellow },
  { phase: "P1.5 Learn Loop", detail: "LLM teaches rules — validated live on real ICICI header mapping. Format learned once, pure rules forever after.", color: C.red },
];
learnings.forEach((l, i) => {
  const y = 1.3 + i * 1.0;
  s9.addShape(pres.shapes.OVAL, { x: 0.8, y: y + 0.12, w: 0.25, h: 0.25, fill: { color: l.color } });
  s9.addText(l.phase, { x: 1.2, y: y + 0.05, w: 2.5, h: 0.35, fontSize: 12, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s9.addText(l.detail, { x: 1.2, y: y + 0.4, w: 8, h: 0.45, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0, lineSpacingMultiple: 1.2 });
});

// Arc visualization
cardBox(s9, 2.0, 4.6, 6.0, 0.7, "EBF5FF");
s9.addText("90%", { x: 2.2, y: 4.65, w: 0.8, h: 0.5, fontSize: 22, fontFace: "Arial Black", color: C.yellow, margin: 0, align: "center" });
s9.addText("→→→", { x: 3.2, y: 4.7, w: 3.5, h: 0.4, fontSize: 20, color: C.accent, align: "center", margin: 0 });
s9.addText("100%", { x: 6.5, y: 4.65, w: 1.2, h: 0.5, fontSize: 22, fontFace: "Arial Black", color: C.green, margin: 0, align: "center" });

// ══════════════════════════════════════════════════════════════════
// SLIDE 10 — LIVE DEMO
// ══════════════════════════════════════════════════════════════════
let s10 = pres.addSlide();
darkSlide(s10);
s10.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.navyDark } });
s10.addText("LIVE DEMO", { x: 0, y: 1.2, w: 10, h: 0.8, fontSize: 48, fontFace: "Arial Black", color: C.white, align: "center", margin: 0 });
s10.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 2.2, w: 3, h: 0.04, fill: { color: C.accent } });

const demoSteps = [
  "Browse 11 cases with parsed data",
  "22 CAM tabs matching every Excel sheet",
  "Yellow fields = editable  |  Grey = auto-populated",
  "Upload document → auto-parse → fields populate",
  "Edit a field → Update → persisted with audit trail",
];
bulletList(s10, demoSteps, 2.0, 2.7, 6, 2.5, { fontSize: 13, color: C.ice });
s10.addText("10", { x: 9.3, y: 5.25, w: 0.5, h: 0.3, fontSize: 9, color: C.gray500, align: "right", fontFace: "Calibri", margin: 0 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 11 — FRAUD DETECTION PORTAL
// ══════════════════════════════════════════════════════════════════
let sF1 = pres.addSlide();
lightSlide(sF1);
slideTitle(sF1, "Fraud Detection: Built Into the Pipeline");
slideSubtitle(sF1, "Automated checks that are impossible to skip — applied consistently on every application");
pageNum(sF1, "11");

const fraudChecks = [
  { icon: "🔍", title: "Bank Statement Tampering", desc: "Balance reconciliation gate detects modified transactions — if balanceₙ ≠ balanceₙ₋₁ ± amount, flag it. Font/pixel analysis for PDF manipulation.", color: C.red, bg: C.redBg },
  { icon: "🆔", title: "Identity Fraud Detection", desc: "PAN/mobile dedupe across applicant & co-applicant. Cross-check PAN embedded in GSTIN. Name match between bank statement holder and applicant.", color: C.yellow, bg: C.yellowBg },
  { icon: "📊", title: "GST Mismatch Detection", desc: "GSTIN format validation, PAN-in-GSTIN cross-check. GST turnover vs bank credits variance flagging. Filing gap detection.", color: C.accent, bg: "EBF5FF" },
  { icon: "📋", title: "Document Completeness", desc: "Auto-checks if all required pre-PD documents are uploaded. Flags missing bank statements, GST returns, KYC, ITR before CM review starts.", color: C.green, bg: C.greenBg },
];
fraudChecks.forEach((f, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = 0.7 + col * 4.5;
  const y = 1.55 + row * 1.8;
  cardBox(sF1, x, y, 4.2, 1.55, f.bg);
  sF1.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.08, h: 1.55, fill: { color: f.color } });
  sF1.addText(f.icon + "  " + f.title, { x: x + 0.25, y: y + 0.1, w: 3.8, h: 0.3, fontSize: 13, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  sF1.addText(f.desc, { x: x + 0.25, y: y + 0.5, w: 3.8, h: 0.9, fontSize: 10, fontFace: "Calibri", color: C.gray700, margin: 0, lineSpacingMultiple: 1.3 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 12 — FRAUD PORTAL IN ACTION
// ══════════════════════════════════════════════════════════════════
let sF2 = pres.addSlide();
darkSlide(sF2);
slideTitle(sF2, "Fraud Portal: Attention Panel", { dark: true });
slideSubtitle(sF2, "Every exception surfaces as a finding — severity-ranked, evidence-linked, auditable", { dark: true });
pageNum(sF2, "12");

// Severity cards
const severities = [
  { level: "HIGH", color: C.red, bg: "3D1010", examples: "Tampered bank statement\nPAN dedupe clash\nGSTIN-PAN mismatch" },
  { level: "MEDIUM", color: C.yellow, bg: "3D3306", examples: "Name mismatch on bank stmt\nMobile dedupe clash\nGSTIN format invalid" },
  { level: "LOW", color: C.accent, bg: "0F1A3D", examples: "Minor GST variance\nDocument completeness gap\nFiling frequency irregular" },
];
severities.forEach((s, i) => {
  const x = 0.8 + i * 3.1;
  cardBox(sF2, x, 1.6, 2.8, 2.2, s.bg);
  sF2.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.1, y: 1.72, w: 0.7, h: 0.3, fill: { color: s.color }, rectRadius: 0.05 });
  sF2.addText(s.level, { x: x + 0.1, y: 1.72, w: 0.7, h: 0.3, fontSize: 9, fontFace: "Arial", color: C.white, bold: true, align: "center", valign: "middle", margin: 0 });
  sF2.addText(s.examples, { x: x + 0.15, y: 2.15, w: 2.5, h: 1.4, fontSize: 10, fontFace: "Calibri", color: C.ice, margin: 0, lineSpacingMultiple: 1.4 });
});

// Finding format
cardBox(sF2, 0.8, 4.1, 8.4, 1.0, "1A2040");
sF2.addText("Each finding is structured:", { x: 1.0, y: 4.18, w: 3, h: 0.25, fontSize: 11, fontFace: "Arial", color: C.accent, bold: true, margin: 0 });
sF2.addText('{ "doc": "bank_statement.pdf", "type": "tampered_total", "severity": "high", "evidence": "Font mismatch on total row", "confidence": 0.81 }', {
  x: 1.0, y: 4.5, w: 8.0, h: 0.45, fontSize: 9, fontFace: "Consolas", color: C.ice, margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 13 — BUSINESS IMPACT (was 11)
// ══════════════════════════════════════════════════════════════════
let s11 = pres.addSlide();
lightSlide(s11);
slideTitle(s11, "Business Impact");
slideSubtitle(s11, "Primary lever: underwriter bandwidth → operations cost");
pageNum(s11, "13");

const impacts = [
  { stat: "1-2 hrs", label: "saved per unparseable statement", sub: "~20% of all cases" },
  { stat: "15 min", label: "review replaces manual CAM fill", sub: "from hours → minutes" },
  { stat: "100%", label: "consistent automated checks", sub: "dedupe, GSTIN, name match" },
  { stat: "Linear", label: "scale without more analysts", sub: "compounding learn-from-LLM" },
];
impacts.forEach((imp, i) => {
  const x = 0.5 + i * 2.35;
  cardBox(s11, x, 1.55, 2.15, 1.65);
  s11.addText(imp.stat, { x, y: 1.65, w: 2.15, h: 0.5, fontSize: 24, fontFace: "Arial Black", color: C.accent, align: "center", margin: 0 });
  s11.addText(imp.label, { x: x + 0.1, y: 2.2, w: 1.95, h: 0.4, fontSize: 10, fontFace: "Calibri", color: C.gray900, align: "center", bold: true, margin: 0 });
  s11.addText(imp.sub, { x: x + 0.1, y: 2.6, w: 1.95, h: 0.35, fontSize: 9, fontFace: "Calibri", color: C.gray500, align: "center", margin: 0 });
});

bulletList(s11, [
  "Removes manual updation — auto-populate, review exceptions only",
  "Cuts CE↔CM back-and-forth — completeness check flags missing docs upfront",
  "Compounding returns — each new bank format is a one-time cost, then pure rules",
  "Scales linearly — more applications ≠ proportionally more analyst hours",
], 0.7, 3.5, 8.6, 1.8, { fontSize: 11 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 12 — ROADMAP
// ══════════════════════════════════════════════════════════════════
let s12 = pres.addSlide();
lightSlide(s12);
slideTitle(s12, "Roadmap & Ask");
pageNum(s12, "14");

const roadmap = [
  { phase: "P1", title: "Portal replacing CAM", desc: "Browse, upload, edit, export — full underwriter workflow", color: C.accent },
  { phase: "P2", title: "Fraud detection v2", desc: "ML-based tamper detection, cross-document anomaly scoring, real-time fraud alerts", color: C.red },
  { phase: "P3", title: "Extend learning loop", desc: "Promote LLM-text formats into learned recipes; extend to GST/ITR/KYC", color: C.green },
  { phase: "P4", title: "CE password affordance", desc: "CE-supplied passwords for PDFs no identity-derived candidate unlocks", color: C.gray500 },
];
roadmap.forEach((r, i) => {
  const y = 1.3 + i * 0.95;
  cardBox(s12, 0.7, y, 8.6, 0.8);
  s12.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.9, y: y + 0.15, w: 0.55, h: 0.5, fill: { color: r.color }, rectRadius: 0.05 });
  s12.addText(r.phase, { x: 0.9, y: y + 0.15, w: 0.55, h: 0.5, fontSize: 11, fontFace: "Arial", color: C.white, bold: true, align: "center", valign: "middle", margin: 0 });
  s12.addText(r.title, { x: 1.65, y: y + 0.12, w: 4, h: 0.3, fontSize: 13, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s12.addText(r.desc, { x: 1.65, y: y + 0.42, w: 7.4, h: 0.3, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0 });
});

cardBox(s12, 2.5, 5.0, 5, 0.45, "EBF5FF");
s12.addText("Ask: Pilot on a live queue to quantify hours saved", {
  x: 2.5, y: 5.0, w: 5, h: 0.45, fontSize: 13, fontFace: "Arial", color: C.accentDark, bold: true, align: "center", valign: "middle", margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 13 — TECH STACK
// ══════════════════════════════════════════════════════════════════
let s13 = pres.addSlide();
darkSlide(s13);
slideTitle(s13, "Tech Stack", { dark: true });
s13.addText("15", { x: 9.3, y: 5.25, w: 0.5, h: 0.3, fontSize: 9, color: C.gray500, align: "right", fontFace: "Calibri", margin: 0 });

const stacks = [
  { cat: "Backend", items: "Python · FastAPI · pdfplumber · openpyxl · Azure OpenAI (GPT-4o) · pandas" },
  { cat: "Frontend", items: "React · TypeScript · Tailwind CSS · Recharts · Vite" },
  { cat: "Infrastructure", items: "Docker (Rancher Desktop) · PostgreSQL · Redis" },
  { cat: "Fraud Engine", items: "Balance reconciliation · PAN/GSTIN cross-check · Name match · Document completeness" },
  { cat: "Portal", items: "22-tab CAM view · 25-sheet parser · ~2,000 editable fields/CAM · Fraud attention panel" },
];
stacks.forEach((st, i) => {
  const y = 1.3 + i * 1.0;
  cardBox(s13, 0.8, y, 8.4, 0.8, "1A2040");
  s13.addText(st.cat, { x: 1.0, y: y + 0.1, w: 2, h: 0.25, fontSize: 12, fontFace: "Arial", color: C.accent, bold: true, margin: 0 });
  s13.addText(st.items, { x: 1.0, y: y + 0.38, w: 8, h: 0.3, fontSize: 10, fontFace: "Calibri", color: C.ice, margin: 0 });
});

s13.addText("github.com/Ritik-slice/EDL-PORTAL", {
  x: 0.8, y: 5.0, w: 8.4, h: 0.3, fontSize: 11, fontFace: "Consolas", color: C.gray500, align: "center", margin: 0,
});

// ══════════════════════════════════════════════════════════════════
// SAVE
// ══════════════════════════════════════════════════════════════════
pres.writeFile({ fileName: "/Users/ritiksiklighar/cam-platform/presentation/Slice3.0_EDL_Copilot.pptx" })
  .then(() => console.log("PPTX created successfully!"))
  .catch((err) => console.error("Error:", err));
