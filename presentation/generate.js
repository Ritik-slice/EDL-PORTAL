const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Ritik, Hardik, Amar";
pres.title = "EDL Underwriting Co-Pilot — Slice 3.0 Hackathon";

// ── Color palette ──
const C = {
  navy: "1E2761", navyDark: "141C47", ice: "CADCFC",
  white: "FFFFFF", gray100: "F4F5F7", gray200: "E2E4EA",
  gray500: "6B7280", gray700: "374151", gray900: "111827",
  accent: "3B82F6", accentDark: "2563EB",
  green: "16A34A", greenBg: "DCFCE7",
  red: "DC2626", redBg: "FEE2E2",
  yellow: "F59E0B", yellowBg: "FEF3C7",
  orange: "EA580C", orangeBg: "FFF7ED",
};

// ── Helpers ──
function darkSlide(s) { s.background = { color: C.navy }; }
function lightSlide(s) {
  s.background = { color: C.white };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: 5.625, fill: { color: C.accent } });
}
function slideTitle(s, t, o = {}) {
  s.addText(t, { x: 0.7, y: 0.3, w: 8.6, h: 0.55, fontSize: 28, fontFace: "Arial Black", color: o.dark ? C.white : C.gray900, bold: true, margin: 0 });
}
function slideSub(s, t, o = {}) {
  s.addText(t, { x: 0.7, y: 0.88, w: 8.6, h: 0.4, fontSize: 13, fontFace: "Calibri", color: o.dark ? C.ice : C.gray500, italic: true, margin: 0 });
}
function card(s, x, y, w, h, fill = C.gray100) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, rectRadius: 0.08, shadow: { type: "outer", color: "000000", blur: 4, offset: 1, angle: 135, opacity: 0.08 } });
}
function stat(s, x, y, w, num, label, color = C.accent) {
  card(s, x, y, w, 0.9);
  s.addText(num, { x, y: y + 0.08, w, h: 0.45, fontSize: 22, fontFace: "Arial Black", color, align: "center", margin: 0 });
  s.addText(label, { x, y: y + 0.48, w, h: 0.35, fontSize: 9, fontFace: "Calibri", color: C.gray500, align: "center", margin: 0 });
}
function bullets(s, items, x, y, w, h, o = {}) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, fontSize: o.fontSize || 12, color: o.color || C.gray700 } })), { x, y, w, h, fontFace: "Calibri", lineSpacingMultiple: 1.35, margin: 0 });
}
function pgn(s, n) { s.addText(`${n}`, { x: 9.3, y: 5.25, w: 0.5, h: 0.3, fontSize: 9, color: C.gray500, align: "right", fontFace: "Calibri", margin: 0 }); }

// ══════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ══════════════════════════════════════════════════════════════════
let s1 = pres.addSlide(); darkSlide(s1);
s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s1.addText("EDL UNDERWRITING", { x: 0.8, y: 1.0, w: 8.4, h: 0.7, fontSize: 42, fontFace: "Arial Black", color: C.white, margin: 0 });
s1.addText("CO-PILOT", { x: 0.8, y: 1.65, w: 8.4, h: 0.65, fontSize: 40, fontFace: "Arial Black", color: C.accent, margin: 0 });
s1.addText("Solve the parsing the vendor can't — and learn every format.", { x: 0.8, y: 2.5, w: 7, h: 0.4, fontSize: 16, fontFace: "Calibri", color: C.ice, italic: true, margin: 0 });
s1.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 3.1, w: 2.5, h: 0.03, fill: { color: C.accent } });
// Impact stats on title
s1.addText("1-2 days → 2-3 mins", { x: 0.8, y: 3.35, w: 4, h: 0.4, fontSize: 18, fontFace: "Arial Black", color: C.green, margin: 0 });
s1.addText("per application review", { x: 0.8, y: 3.7, w: 4, h: 0.3, fontSize: 12, fontFace: "Calibri", color: C.ice, margin: 0 });
s1.addText("30-40 Excel sheets → 1 portal with summary view", { x: 0.8, y: 4.1, w: 6, h: 0.3, fontSize: 12, fontFace: "Calibri", color: C.ice, margin: 0 });
s1.addText("Slice 3.0 Hackathon  |  Team: Ritik, Hardik, Amar", { x: 0.8, y: 5.0, w: 8, h: 0.3, fontSize: 12, fontFace: "Calibri", color: C.gray500, margin: 0 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 2 — THE PROBLEM (DEEP)
// ══════════════════════════════════════════════════════════════════
let s2 = pres.addSlide(); lightSlide(s2);
slideTitle(s2, "The Problem: EDL Underwriting Today"); pgn(s2, "2");

const problems = [
  { icon: "📄", title: "20% PDFs Unparseable", desc: "Bank statement PDFs the vendor (Ignosis) can't parse → 1-2 hrs manual effort per statement. Multiple statements = 1-2 DAYS per application.", color: C.red },
  { icon: "📊", title: "30-40 Excel Sheets", desc: "CAM is a 70-sheet Excel (33 visible + 37 hidden). Underwriter hops sheet to sheet. No summary view. No single source of truth.", color: C.orange },
  { icon: "📧", title: "Documents on Gmail", desc: "CE emails documents to CM. Increases ops bandwidth and TAT. No version control, no tracking, no completeness check.", color: C.yellow },
  { icon: "🔍", title: "Manual Fraud Checks", desc: "CFR, CMR, CERSAI, GST verification — all manual. No tool for document forgery detection. Agent fraud unchecked.", color: C.red },
  { icon: "🔄", title: "CE↔CM Back-and-forth", desc: "CM asks CE to re-fetch missing docs mid-PD. Co-applicant VKYC is challenge for sales (requires assist).", color: C.accent },
  { icon: "✍️", title: "Manual Data Entry", desc: "Commercial CIBIL filled manually. Valuation report manual. EMI/obligation derived by hand. Income re-computed every time.", color: C.gray700 },
];
problems.forEach((p, i) => {
  const col = i % 3; const row = Math.floor(i / 3);
  const x = 0.5 + col * 3.15; const y = 1.2 + row * 2.05;
  card(s2, x, y, 2.95, 1.8);
  s2.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h: 1.8, fill: { color: p.color } });
  s2.addText(p.icon + "  " + p.title, { x: x + 0.2, y: y + 0.1, w: 2.6, h: 0.3, fontSize: 11, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s2.addText(p.desc, { x: x + 0.2, y: y + 0.5, w: 2.6, h: 1.15, fontSize: 9.5, fontFace: "Calibri", color: C.gray500, margin: 0, lineSpacingMultiple: 1.25 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 3 — IMPACT NUMBERS (NEW)
// ══════════════════════════════════════════════════════════════════
let s3 = pres.addSlide(); darkSlide(s3);
slideTitle(s3, "The Impact: Before vs After", { dark: true }); pgn(s3, "3");

const befAft = [
  { metric: "Single Bank Statement", before: "1-2 hours", after: "2-3 minutes", icon: "⏱" },
  { metric: "Full Application Review", before: "1-2 days", after: "15 minutes", icon: "📋" },
  { metric: "Document Sharing", before: "Gmail attachments", after: "Portal upload", icon: "📧" },
  { metric: "Navigation", before: "30-40 Excel sheets", after: "1 portal + summary", icon: "📊" },
  { metric: "Fraud Checks", before: "Manual / skippable", after: "Automated / consistent", icon: "🔍" },
  { metric: "Document Completeness", before: "CM discovers mid-PD", after: "Auto-flagged upfront", icon: "✅" },
];
// Header
s3.addText("METRIC", { x: 0.8, y: 1.2, w: 3, h: 0.35, fontSize: 10, fontFace: "Arial", color: C.gray500, bold: true, margin: 0 });
s3.addText("BEFORE", { x: 4.2, y: 1.2, w: 2.5, h: 0.35, fontSize: 10, fontFace: "Arial", color: C.red, bold: true, margin: 0 });
s3.addText("AFTER (OUR SOLUTION)", { x: 7.0, y: 1.2, w: 2.5, h: 0.35, fontSize: 10, fontFace: "Arial", color: C.green, bold: true, margin: 0 });
s3.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: 1.55, w: 8.4, h: 0.02, fill: { color: C.gray500 } });
befAft.forEach((b, i) => {
  const y = 1.7 + i * 0.62;
  s3.addText(b.icon + "  " + b.metric, { x: 0.8, y, w: 3.2, h: 0.5, fontSize: 11, fontFace: "Calibri", color: C.white, margin: 0 });
  s3.addText(b.before, { x: 4.2, y, w: 2.5, h: 0.5, fontSize: 11, fontFace: "Calibri", color: C.redBg, margin: 0 });
  s3.addText(b.after, { x: 7.0, y, w: 2.5, h: 0.5, fontSize: 11, fontFace: "Calibri", color: C.greenBg, bold: true, margin: 0 });
  if (i < befAft.length - 1) s3.addShape(pres.shapes.RECTANGLE, { x: 0.8, y: y + 0.52, w: 8.4, h: 0.01, fill: { color: "2A3570" } });
});

// Big stat
card(s3, 1.5, 4.55, 3.0, 0.85, "0D1B4A");
s3.addText("1-2 days → 2-3 min", { x: 1.5, y: 4.6, w: 3.0, h: 0.4, fontSize: 16, fontFace: "Arial Black", color: C.green, align: "center", margin: 0 });
s3.addText("per application", { x: 1.5, y: 4.95, w: 3.0, h: 0.3, fontSize: 10, fontFace: "Calibri", color: C.ice, align: "center", margin: 0 });
card(s3, 5.5, 4.55, 3.0, 0.85, "0D1B4A");
s3.addText("30-40 sheets → 1 view", { x: 5.5, y: 4.6, w: 3.0, h: 0.4, fontSize: 16, fontFace: "Arial Black", color: C.accent, align: "center", margin: 0 });
s3.addText("with summary dashboard", { x: 5.5, y: 4.95, w: 3.0, h: 0.3, fontSize: 10, fontFace: "Calibri", color: C.ice, align: "center", margin: 0 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 4 — SOLUTION
// ══════════════════════════════════════════════════════════════════
let s4 = pres.addSlide(); lightSlide(s4);
slideTitle(s4, "What We Built: 3 Products"); pgn(s4, "4");

const products = [
  { num: "01", title: "CAM Automation Portal", desc: "Replaces the 30-40 sheet Excel CAM with a web portal. Summary view at a glance. 22 tabs matching every Excel sheet. No sheet hopping. Editable yellow fields + auto-populated grey fields.", color: C.accent, bg: "EBF5FF" },
  { num: "02", title: "Document Intelligence Engine", desc: "Parses the 20% unparseable bank PDFs. Classifies documents by content (not filename). Extracts EMI/income/ABB/bounces. GST turnover from GSTR-3B. Learns every new format via LLM.", color: C.green, bg: C.greenBg },
  { num: "03", title: "Fraud Detection Portal", desc: "Automated fraud checks: bank statement tampering (balance reconciliation), identity fraud (PAN/mobile dedupe), GST mismatch, CERSAI cross-check, document forgery detection, document completeness.", color: C.red, bg: C.redBg },
];
products.forEach((p, i) => {
  const y = 1.2 + i * 1.4;
  card(s4, 0.7, y, 8.6, 1.2, p.bg);
  s4.addShape(pres.shapes.RECTANGLE, { x: 0.7, y, w: 0.08, h: 1.2, fill: { color: p.color } });
  s4.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.95, y: y + 0.15, w: 0.5, h: 0.5, fill: { color: p.color }, rectRadius: 0.06 });
  s4.addText(p.num, { x: 0.95, y: y + 0.15, w: 0.5, h: 0.5, fontSize: 14, fontFace: "Arial Black", color: C.white, align: "center", valign: "middle", margin: 0 });
  s4.addText(p.title, { x: 1.65, y: y + 0.12, w: 7.4, h: 0.35, fontSize: 16, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s4.addText(p.desc, { x: 1.65, y: y + 0.5, w: 7.4, h: 0.6, fontSize: 10.5, fontFace: "Calibri", color: C.gray700, margin: 0, lineSpacingMultiple: 1.3 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 5 — ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
let s5 = pres.addSlide(); lightSlide(s5);
slideTitle(s5, "Architecture: Reuse, Don't Rebuild"); pgn(s5, "5");
slideSub(s5, "JSON is the source of truth; Excel is a populate-only compute target");

const layers = [
  { label: "INPUT_ sheets (hidden)", desc: "Machine-fed, dotted JSON keys (applicantDetails.pan)", color: C.accent, bg: "EBF5FF" },
  { label: "Logic_ sheets (hidden)", desc: "Existing underwriting formulas — reused as-is, never rebuilt", color: C.yellow, bg: C.yellowBg },
  { label: "Presentation (33 visible)", desc: "What CE/CM read — auto-populated from Logic_ calculations", color: C.green, bg: C.greenBg },
];
layers.forEach((l, i) => {
  const y = 1.5 + i * 1.15;
  card(s5, 0.7, y, 8.6, 0.95, l.bg);
  s5.addShape(pres.shapes.RECTANGLE, { x: 0.7, y, w: 0.08, h: 0.95, fill: { color: l.color } });
  s5.addText(`Layer ${i + 1}: ${l.label}`, { x: 1.0, y: y + 0.1, w: 8, h: 0.3, fontSize: 13, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s5.addText(l.desc, { x: 1.0, y: y + 0.42, w: 8, h: 0.4, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0 });
});
s5.addText("We write only INPUT_ → Logic_ formulas recompute → Zero formula rewriting", { x: 0.7, y: 4.9, w: 8.6, h: 0.35, fontSize: 12, fontFace: "Calibri", color: C.accentDark, bold: true, align: "center", margin: 0 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 6 — ROBUSTNESS: RULES + LLM
// ══════════════════════════════════════════════════════════════════
let s6 = pres.addSlide(); lightSlide(s6);
slideTitle(s6, "Parsing Engine: Rules + LLM Learning Loop"); pgn(s6, "6");
slideSub(s6, "Two engines cover each other — and the LLM teaches the rules over time");

const steps = [
  { label: "Statement\nPDF", x: 0.5, w: 1.4, bg: C.gray200 },
  { label: "Rule Extractor\n(archetype-aware)", x: 2.3, w: 1.7, bg: "EBF5FF" },
  { label: "Balance\nreconciles ≥90%?", x: 4.4, w: 1.6, bg: C.yellowBg },
  { label: "Accept\n(method=rule)", x: 6.4, w: 1.5, bg: C.greenBg },
];
steps.forEach((st) => { card(s6, st.x, 1.6, st.w, 0.8, st.bg); s6.addText(st.label, { x: st.x, y: 1.6, w: st.w, h: 0.8, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 }); });
["→", "→", "✓"].forEach((a, i) => { s6.addText(a, { x: [1.95, 4.05, 6.05][i], y: 1.75, w: 0.4, h: 0.4, fontSize: 14, color: C.accent, align: "center", margin: 0 }); });

// LLM path
s6.addText("↓ new format", { x: 3.8, y: 2.45, w: 1.5, h: 0.25, fontSize: 8, color: C.red, align: "center", margin: 0 });
card(s6, 2.3, 2.8, 1.7, 0.65, C.yellowBg); s6.addText("LLM maps\nheader → roles", { x: 2.3, y: 2.8, w: 1.7, h: 0.65, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
card(s6, 4.4, 2.8, 1.6, 0.65, "EBF5FF"); s6.addText("Save learned\nprofile", { x: 4.4, y: 2.8, w: 1.6, h: 0.65, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
card(s6, 6.4, 2.8, 1.5, 0.65, C.greenBg); s6.addText("Pure rules\nforever after", { x: 6.4, y: 2.8, w: 1.5, h: 0.65, fontSize: 9, fontFace: "Calibri", color: C.gray700, align: "center", valign: "middle", margin: 0 });
["→", "→"].forEach((a, i) => { s6.addText(a, { x: [4.05, 6.05][i], y: 2.9, w: 0.4, h: 0.4, fontSize: 14, color: C.yellow, align: "center", margin: 0 }); });

card(s6, 0.5, 3.8, 9.0, 1.3);
s6.addText("What the engine extracts from every bank statement:", { x: 0.7, y: 3.88, w: 8, h: 0.25, fontSize: 11, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
bullets(s6, [
  "EMI / Obligation identification — 250-lender detection from transaction narrations",
  "Monthly income, Average Bank Balance (ABB), bounce analysis",
  "Separate bank account summaries → easy to find bounces, EMI, balances at a glance",
  "Bureau → Statement obligation matching for cross-validation",
], 0.7, 4.2, 8.6, 0.85, { fontSize: 10 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 7 — CAM PORTAL FEATURES
// ══════════════════════════════════════════════════════════════════
let s7 = pres.addSlide(); lightSlide(s7);
slideTitle(s7, "CAM Portal: Summary at a Glance"); pgn(s7, "7");
slideSub(s7, "No more hopping between 30-40 Excel sheets — everything in one view");

const features = [
  { icon: "📊", title: "Summary Dashboard", desc: "All key metrics at a glance — bureau score, FOIR, loan amount, EMI, eligibility" },
  { icon: "📋", title: "22 Tabs = 22 Sheets", desc: "Every Excel sheet is a tab: Bureau, Banking, GST, AIP, Scorecard, Deviations..." },
  { icon: "✏️", title: "Yellow = Editable", desc: "Every field the UW needs to edit is yellow. Click → edit → save. Locked against re-parse." },
  { icon: "🔒", title: "Grey = Auto-filled", desc: "Data from APIs and parsed documents auto-populates. Read-only, source-tracked, auditable." },
  { icon: "📑", title: "Document Upload", desc: "Upload PDFs, Excel, images directly. Auto-parsed and data flows into CAM fields instantly." },
  { icon: "⚡", title: "No Gmail", desc: "All documents in the portal. No email attachments. Reduces ops bandwidth and TAT." },
  { icon: "🔄", title: "Real-time Checks", desc: "Dedupe, GSTIN, name match, completeness — run automatically on every case." },
  { icon: "📥", title: "CAM Export", desc: "One-click export to the standard .xlsm format for existing workflow compatibility." },
];
features.forEach((f, i) => {
  const col = i % 4; const row = Math.floor(i / 4);
  const x = 0.5 + col * 2.35; const y = 1.35 + row * 2.0;
  card(s7, x, y, 2.15, 1.7);
  s7.addText(f.icon, { x: x + 0.1, y: y + 0.1, w: 0.4, h: 0.35, fontSize: 18, margin: 0 });
  s7.addText(f.title, { x: x + 0.1, y: y + 0.5, w: 1.95, h: 0.3, fontSize: 11, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s7.addText(f.desc, { x: x + 0.1, y: y + 0.85, w: 1.95, h: 0.7, fontSize: 9, fontFace: "Calibri", color: C.gray500, margin: 0, lineSpacingMultiple: 1.2 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 8 — FRAUD DETECTION
// ══════════════════════════════════════════════════════════════════
let s8 = pres.addSlide(); lightSlide(s8);
slideTitle(s8, "Fraud Detection Portal"); pgn(s8, "8");
slideSub(s8, "Automated checks that are currently manual, inconsistent, or non-existent");

const frauds = [
  { icon: "🏦", title: "Bank Statement Tampering", desc: "Balance reconciliation gate: balanceₙ must equal balanceₙ₋₁ ± amount. Font/pixel analysis for PDF manipulation. Catches modified totals, inserted rows.", color: C.red, bg: C.redBg },
  { icon: "📋", title: "GST Fraud Detection", desc: "GST Aggregator vs Manual upload mismatch. If GST is available in AA flow but manually uploaded → fraud risk. Customer credentials required for verification via OTP during PD.", color: C.orange, bg: C.orangeBg },
  { icon: "🆔", title: "Identity & Dedupe", desc: "PAN + phone must be unique (applicant + co-applicant). SOP: 1 family = 1 loan. Triggers: geolocation, facematch dedupe. Cross-check PAN embedded in GSTIN.", color: C.yellow, bg: C.yellowBg },
  { icon: "🔐", title: "CERSAI & Hypothecation", desc: "Stock already hypothecated → amount-based trigger for rejection. Machinery already pledged → rejection. Currently manual CFR/CMR/CERSAI — we automate with cross-checks.", color: C.accent, bg: "EBF5FF" },
  { icon: "📄", title: "Document Forgery", desc: "Document modification detection via formatting analysis and content matching. No such tool exists today — caught only by chance. Our portal provides systematic detection.", color: C.red, bg: C.redBg },
  { icon: "🕵️", title: "Agent Fraud Checks", desc: "Currently zero checks for agent-level fraud. Our system tracks document provenance, edit trails, and flags suspicious patterns across applications.", color: C.gray700, bg: C.gray200 },
];
frauds.forEach((f, i) => {
  const col = i % 3; const row = Math.floor(i / 3);
  const x = 0.5 + col * 3.15; const y = 1.35 + row * 2.0;
  card(s8, x, y, 2.95, 1.75, f.bg);
  s8.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.07, h: 1.75, fill: { color: f.color } });
  s8.addText(f.icon + "  " + f.title, { x: x + 0.2, y: y + 0.08, w: 2.6, h: 0.3, fontSize: 10.5, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s8.addText(f.desc, { x: x + 0.2, y: y + 0.45, w: 2.6, h: 1.15, fontSize: 9, fontFace: "Calibri", color: C.gray700, margin: 0, lineSpacingMultiple: 1.25 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 9 — TOP REJECTION REASONS
// ══════════════════════════════════════════════════════════════════
let s9 = pres.addSlide(); darkSlide(s9);
slideTitle(s9, "Top 3 Rejection Reasons — We Catch Them Faster", { dark: true }); pgn(s9, "9");

const rejections = [
  { num: "1", title: "CERSAI: Stock Already Hypothecated", desc: "Amount-based trigger. Stock pledged to another lender → automatic flagging. Currently manual CERSAI check.", color: C.red },
  { num: "2", title: "CERSAI: Machine Already Pledged", desc: "Machinery/P&M hypothecation detected → rejection trigger. Cross-referenced with bureau tradelines.", color: C.orange },
  { num: "3", title: "Eligibility Not Met (Stock/AIP)", desc: "Stock program or Assessed Income Program eligibility falls short. Our engine calculates this automatically across all programs.", color: C.yellow },
];
rejections.forEach((r, i) => {
  const y = 1.3 + i * 1.3;
  card(s9, 0.8, y, 8.4, 1.1, "1A2040");
  s9.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.0, y: y + 0.2, w: 0.55, h: 0.55, fill: { color: r.color }, rectRadius: 0.06 });
  s9.addText(r.num, { x: 1.0, y: y + 0.2, w: 0.55, h: 0.55, fontSize: 18, fontFace: "Arial Black", color: C.white, align: "center", valign: "middle", margin: 0 });
  s9.addText(r.title, { x: 1.8, y: y + 0.15, w: 7, h: 0.3, fontSize: 14, fontFace: "Arial", color: C.white, bold: true, margin: 0 });
  s9.addText(r.desc, { x: 1.8, y: y + 0.5, w: 7, h: 0.45, fontSize: 10.5, fontFace: "Calibri", color: C.ice, margin: 0 });
});

// ══════════════════════════════════════════════════════════════════
// SLIDE 10 — RESULTS
// ══════════════════════════════════════════════════════════════════
let s10 = pres.addSlide(); lightSlide(s10);
slideTitle(s10, "Results: 11 Real CAM Cases"); pgn(s10, "10");

const rows = [
  ["Metric", "Result"],
  ["Exact-scored fields (GSTIN, PAN, name, amount, turnover)", "41/41 (100%)"],
  ["GST annual turnover accuracy", "<0.5% variance"],
  ["SBI statement (new format — vendor couldn't parse)", "0 → 1,530 txns @ 100%"],
  ["Single-Amount format bank (Ramya)", "0% → 100% (1,844 txns)"],
  ["BOB cooperative (vendor-unparseable)", "12/16 @ 100%"],
  ["Loan statement misclassified as bank", "Correctly excluded"],
];
s10.addTable(rows, { x: 0.7, y: 1.2, w: 8.6, border: { type: "solid", pt: 0.5, color: C.gray200 }, colW: [5.8, 2.8], fontSize: 11, fontFace: "Calibri", color: C.gray700, autoPage: false });

stat(s10, 0.9, 4.4, 2.5, "100%", "Exact Match Rate", C.green);
stat(s10, 3.8, 4.4, 2.5, "1-2 days → 3 min", "Review Time", C.accent);
stat(s10, 6.7, 4.4, 2.5, "90% → 100%", "Learning Arc", C.accentDark);

// ══════════════════════════════════════════════════════════════════
// SLIDE 11 — LIVE DEMO
// ══════════════════════════════════════════════════════════════════
let s11 = pres.addSlide(); darkSlide(s11);
s11.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 5.625, fill: { color: C.navyDark } });
s11.addText("LIVE DEMO", { x: 0, y: 0.8, w: 10, h: 0.8, fontSize: 48, fontFace: "Arial Black", color: C.white, align: "center", margin: 0 });
s11.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 1.8, w: 3, h: 0.04, fill: { color: C.accent } });
bullets(s11, [
  "Browse 11 real cases with all parsed data",
  "Summary dashboard — all key metrics at a glance",
  "22 CAM tabs matching every Excel sheet",
  "Yellow fields = editable  |  Grey = auto-populated",
  "Upload a document → auto-parse → fields populate",
  "Fraud attention panel — severity-ranked findings",
  "Edit a field → Update → persisted with audit trail",
], 1.5, 2.3, 7, 3.0, { fontSize: 14, color: C.ice });
pgn(s11, "11");

// ══════════════════════════════════════════════════════════════════
// SLIDE 12 — BUSINESS IMPACT
// ══════════════════════════════════════════════════════════════════
let s12 = pres.addSlide(); lightSlide(s12);
slideTitle(s12, "Business Impact"); pgn(s12, "12");

const impacts = [
  { stat: "1-2 days\n→ 3 min", label: "Full application review", sub: "Summary view eliminates sheet hopping" },
  { stat: "0\nGmail", label: "No document sharing via email", sub: "Portal upload reduces TAT" },
  { stat: "100%\nchecks", label: "Consistent fraud detection", sub: "CFR/CERSAI/dedupe automated" },
  { stat: "30-40\n→ 1", label: "Excel sheets → 1 portal", sub: "With summary at a glance" },
];
impacts.forEach((imp, i) => {
  const x = 0.5 + i * 2.35;
  card(s12, x, 1.2, 2.15, 1.55);
  s12.addText(imp.stat, { x, y: 1.25, w: 2.15, h: 0.6, fontSize: 18, fontFace: "Arial Black", color: C.accent, align: "center", margin: 0 });
  s12.addText(imp.label, { x: x + 0.1, y: 1.9, w: 1.95, h: 0.35, fontSize: 10, fontFace: "Calibri", color: C.gray900, align: "center", bold: true, margin: 0 });
  s12.addText(imp.sub, { x: x + 0.1, y: 2.25, w: 1.95, h: 0.35, fontSize: 9, fontFace: "Calibri", color: C.gray500, align: "center", margin: 0 });
});

bullets(s12, [
  "Eliminates 1-2 hr/statement manual parse on the ~20% vendor can't read",
  "Turns manual CAM data-entry into a 15-minute review-and-approve",
  "Removes CE↔CM back-and-forth — completeness check flags missing docs upfront",
  "Consistent automated fraud checks — dedupe, GSTIN, CERSAI, document forgery",
  "Compounding returns — each new bank format is a one-time cost, then pure rules",
  "Reduces risk through fraud detection that currently has no tooling",
], 0.7, 3.05, 8.6, 2.3, { fontSize: 11 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 13 — ROADMAP
// ══════════════════════════════════════════════════════════════════
let s13 = pres.addSlide(); lightSlide(s13);
slideTitle(s13, "Roadmap & Ask"); pgn(s13, "13");

const roadmap = [
  { phase: "P1", title: "Portal fully replacing CAM for underwriters", desc: "Browse, upload, edit, export — full workflow. Connect with existing LOS APIs.", color: C.accent },
  { phase: "P2", title: "Fraud detection v2 — ML-based", desc: "ML tamper detection, cross-document anomaly scoring, real-time alerts, CERSAI automation", color: C.red },
  { phase: "P3", title: "Extend parsing + learning to all document types", desc: "GST, ITR, KYC, valuation reports. Learn format per document type, not just bank statements.", color: C.green },
  { phase: "P4", title: "PD Notes & VKYC automation", desc: "Voxar summary → PD notes auto-fill. Pre-PD AI-based questioning (30+ questions). Co-applicant VKYC assist.", color: C.yellow },
];
roadmap.forEach((r, i) => {
  const y = 1.15 + i * 0.98;
  card(s13, 0.7, y, 8.6, 0.82);
  s13.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.9, y: y + 0.15, w: 0.5, h: 0.5, fill: { color: r.color }, rectRadius: 0.05 });
  s13.addText(r.phase, { x: 0.9, y: y + 0.15, w: 0.5, h: 0.5, fontSize: 11, fontFace: "Arial", color: C.white, bold: true, align: "center", valign: "middle", margin: 0 });
  s13.addText(r.title, { x: 1.6, y: y + 0.1, w: 7.5, h: 0.3, fontSize: 12, fontFace: "Arial", color: C.gray900, bold: true, margin: 0 });
  s13.addText(r.desc, { x: 1.6, y: y + 0.42, w: 7.5, h: 0.3, fontSize: 10, fontFace: "Calibri", color: C.gray500, margin: 0 });
});

card(s13, 2.0, 5.05, 6, 0.45, "EBF5FF");
s13.addText("Ask: Pilot on a live queue to quantify hours saved & fraud caught", { x: 2.0, y: 5.05, w: 6, h: 0.45, fontSize: 13, fontFace: "Arial", color: C.accentDark, bold: true, align: "center", valign: "middle", margin: 0 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 14 — TECH STACK
// ══════════════════════════════════════════════════════════════════
let s14 = pres.addSlide(); darkSlide(s14);
slideTitle(s14, "Tech Stack", { dark: true }); pgn(s14, "14");

const stacks = [
  { cat: "Backend", items: "Python · FastAPI · pdfplumber · openpyxl · Azure OpenAI (GPT-4o) · pandas" },
  { cat: "Frontend", items: "React · TypeScript · Tailwind CSS · Recharts · Vite" },
  { cat: "Infrastructure", items: "Docker (Rancher Desktop) · PostgreSQL · Redis" },
  { cat: "Parsing Engine", items: "Hybrid rules + LLM · Balance reconciliation · 250-lender EMI detection · Content classification" },
  { cat: "Fraud Engine", items: "Tamper detection · PAN/GSTIN cross-check · Dedupe · CERSAI · Document completeness" },
  { cat: "Portal", items: "22-tab CAM view · 25-sheet parser · ~2,000 editable fields/CAM · Summary dashboard" },
];
stacks.forEach((st, i) => {
  const y = 1.1 + i * 0.72;
  card(s14, 0.8, y, 8.4, 0.6, "1A2040");
  s14.addText(st.cat, { x: 1.0, y: y + 0.05, w: 2, h: 0.22, fontSize: 11, fontFace: "Arial", color: C.accent, bold: true, margin: 0 });
  s14.addText(st.items, { x: 1.0, y: y + 0.3, w: 8, h: 0.25, fontSize: 9.5, fontFace: "Calibri", color: C.ice, margin: 0 });
});
s14.addText("github.com/Ritik-slice/EDL-PORTAL", { x: 0.8, y: 5.15, w: 8.4, h: 0.25, fontSize: 10, fontFace: "Consolas", color: C.gray500, align: "center", margin: 0 });

// ══════════════════════════════════════════════════════════════════
// SLIDE 15 — THANK YOU
// ══════════════════════════════════════════════════════════════════
let s15 = pres.addSlide(); darkSlide(s15);
s15.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: C.accent } });
s15.addText("Thank You", { x: 0, y: 1.5, w: 10, h: 0.8, fontSize: 48, fontFace: "Arial Black", color: C.white, align: "center", margin: 0 });
s15.addShape(pres.shapes.RECTANGLE, { x: 3.5, y: 2.5, w: 3, h: 0.04, fill: { color: C.accent } });
s15.addText("EDL Underwriting Co-Pilot + Fraud Detection Portal", { x: 0, y: 2.8, w: 10, h: 0.4, fontSize: 16, fontFace: "Calibri", color: C.ice, align: "center", margin: 0 });
s15.addText("1-2 days → 2-3 minutes  ·  30-40 sheets → 1 portal  ·  Automated fraud checks", { x: 0, y: 3.4, w: 10, h: 0.35, fontSize: 13, fontFace: "Calibri", color: C.accent, align: "center", margin: 0 });
s15.addText("Team: Ritik · Hardik · Amar", { x: 0, y: 4.3, w: 10, h: 0.3, fontSize: 14, fontFace: "Calibri", color: C.gray500, align: "center", margin: 0 });
s15.addText("Slice 3.0 Hackathon", { x: 0, y: 4.7, w: 10, h: 0.3, fontSize: 12, fontFace: "Calibri", color: C.gray500, align: "center", margin: 0 });

// ══════════════════════════════════════════════════════════════════
pres.writeFile({ fileName: "/Users/ritiksiklighar/cam-platform/presentation/Slice3.0_EDL_Copilot.pptx" })
  .then(() => console.log("PPTX created successfully! (15 slides)"))
  .catch((err) => console.error("Error:", err));
