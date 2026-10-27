// ---- Rules mode: no AI. Plain code reads the OCR text and fills the same fields the AI would. ----
const R_MONEY = /(\d{1,3}(?:,\d{3})+|\d+)\s?\.\s?(\d{2})(?!\d)/g;
function moneyIn(s) { const out = []; let m; R_MONEY.lastIndex = 0; while ((m = R_MONEY.exec(String(s)))) out.push(Number(m[1].replace(/,/g, "") + "." + m[2])); return out; }
function fmtTin(s) {
  const d = String(s).replace(/\D/g, "");
  if (d.length < 9) return null;
  const x = d.slice(0, 12).padEnd(12, "0");
  return `${x.slice(0, 3)}-${x.slice(3, 6)}-${x.slice(6, 9)}-${x.slice(9, 12)}`;
}
const TIN_RE = /(\d{3})[\s\-.]?(\d{3})[\s\-.]?(\d{3})(?:[\s\-.]?(\d{3,5}))?/;
function findTin(lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const at = l.search(/\bTIN\b/i);
    if (at < 0 || /printer/i.test(l)) continue;
    const m = l.slice(at).match(TIN_RE);
    if (m && (m[1] + m[2] + m[3]).length === 9) return { tin: fmtTin(m[0]), line: i };
  }
  return null;
}
const JUNK = (s) => { const t = s.replace(/\s/g, ""); if (t.length < 3) return true; const ok = (t.match(/[A-Za-z0-9&.,'\-/()]/g) || []).length; return ok / t.length < 0.85 || !/[A-Za-z]{3,}/.test(s); };
const ADDR = /\b(purok|st\.?|street|rd\.?|road|city|brgy|barangay|blvd|ave|avenue|highway|km|benguet|baguio|kalinga|tabuk|trinidad|isabela|pangasinan|manila|philippines|poblacion|sitio|zone)\b/i;
function validDate(y, m, d) { return y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31; }
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function findDate(lines, avoid) {
  const skip = /issued|expir|accredit|authority|valid until|printed|permit|ptu|atp/i;
  const cands = [];
  lines.forEach((l, i) => {
    if (skip.test(l)) return;
    let m;
    const iso = /(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g;
    while ((m = iso.exec(l))) if (validDate(+m[1], +m[2], +m[3])) cands.push({ y: +m[1], m: +m[2], d: +m[3], amb: false, i, lab: /date/i.test(l) });
    const dmy = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|\d{2})(?!\d)/g;
    while ((m = dmy.exec(l))) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      let mo = a, d = b, amb = a <= 12 && b <= 12 && a !== b;
      if (a > 12 && b <= 12) { mo = b; d = a; amb = false; }
      if (validDate(y, mo, d)) cands.push({ y, m: mo, d, amb, i, lab: /date/i.test(l) });
    }
    const nm = new RegExp("(" + MONTHS.join("|") + ")[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})", "ig");
    while ((m = nm.exec(l))) { const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; if (validDate(+m[3], mo, +m[2])) cands.push({ y: +m[3], m: mo, d: +m[2], amb: false, i, lab: true }); }
  });
  if (!cands.length) return null;
  const c = cands.find((x) => x.lab) || cands[0];
  return { iso: `${c.y}-${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`, amb: c.amb };
}
function amountOnLine(lines, re, not) {
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i]) || (not && not.test(lines[i]))) continue;
    let a = moneyIn(lines[i]); if (!a.length && lines[i + 1]) a = moneyIn(lines[i + 1]);
    if (a.length) return a[a.length - 1];
  }
  return null;
}
const cleanLines = (t) => String(t).split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

function parsePurchaseText(text) {
  const lines = cleanLines(text), unsure = [], out = { date: null, doc_no: null, tin: null, name: null, address: null, buyer_name: null, buyer_tin: null, total: null, vat_type: null, doc_type: null, not_valid_for_input_tax: false };
  const t = findTin(lines);
  if (t) out.tin = t.tin; else unsure.push("tin");
  // seller name and address: the clean lines above the TIN line
  const top = lines.slice(0, t ? Math.max(t.line + 1, 3) : 6).filter((l) => !/\bTIN\b/i.test(l));
  const nameLines = [], addrLines = [];
  for (const l of top) {
    if (JUNK(l)) continue;
    if (ADDR.test(l) && !(l === lines[0] && !nameLines.length && !/purok|brgy|street|\bst\.|\brd\b|road|\d{3,}/i.test(l))) { addrLines.push(l); continue; }
    if (/tel|phone|cellphone|email|@|www\./i.test(l)) continue;
    if (nameLines.length < 2 && !addrLines.length) nameLines.push(l);
  }
  if (nameLines.length) out.name = nameLines.join(" ").slice(0, 80); else unsure.push("name");
  if (addrLines.length) out.address = addrLines.join(", ").slice(0, 120); else unsure.push("address");
  if (out.name && (!t || t.line > 5)) unsure.push("name");
  const dt = findDate(lines);
  if (dt) { out.date = dt.iso; if (dt.amb) unsure.push("date"); } else unsure.push("date");
  // document number
  let no = null, weak = false, m2;
  for (const l of lines) {
    if (/printer|accredit|bklts|authority|ptu|permit|plate|serial|machine|trans/i.test(l)) continue;
    const m = l.match(/\b(?:S[1Il]{1,2}|SI)\s*#\s*[:.]?\s*([A-Z]{0,3}\d[\d\-]{3,})/i) || l.match(/\b(?:S\.?I\.?|O\.?R\.?|D\.?R\.?|C\.?R\.?|INV(?:OICE)?\.?|RECEIPT|SALES\s+INVOICE)\s*(?:NO\.?|#|NUMBER)\s*[:.\-\\]?\s*([A-Z]{0,3}\d[\d\-]{2,})/i) || ((m2 = l.match(/\bNo\.?\s*[:\\]?\s*([A-Z]{0,3}\d[\d\-]{3,})/)) && (weak = true, m2));
    if (m) { no = m[1]; break; }
  }
  if (no && /^[O0]\d/.test(no)) no = no.replace(/O/g, "0");
  if (no) out.doc_no = no; else unsure.push("doc_no");
  if (no && weak) unsure.push("doc_no");
  // total
  let tot = amountOnLine(lines, /total\s*(amount)?\s*due|amount\s*due|grand\s*total|total\s*sales|amount\s*paid|\btotal\b/i, /vat|less|sub|zero|exempt|net\s*of/i);
  if (tot == null) { const all = moneyIn(lines.join("\n")); if (all.length) { tot = Math.max(...all); unsure.push("total"); } else unsure.push("total"); }
  out.total = tot;
  // VAT or NON-VAT
  const head = lines.slice(0, 12).join(" \n ");
  if (/non[\s\-]*vat/i.test(head)) out.vat_type = "NON-VAT"; else if (/vat[\s\-]*reg|vat\s*registered|\bvat\b.*\btin\b/i.test(head) || /vat[\s\-]*reg/i.test(lines.join(" "))) out.vat_type = "VAT"; else unsure.push("vat_type");
  if (/not\s+valid\s+for\s+(claiming\s+)?input\s+tax/i.test(lines.join(" "))) out.not_valid_for_input_tax = true;
  const all = lines.join(" ");
  out.doc_type = /collection\s+receipt/i.test(all) ? "Collection Receipt" : /delivery\s+receipt/i.test(all) ? "Delivery Receipt" : /official\s+receipt/i.test(all) ? "Official Receipt" : /cash\s+sales/i.test(all) ? "Cash Sales Invoice" : /sales\s+invoice/i.test(all) ? "Sales Invoice" : /invoice/i.test(all) ? "Invoice" : /receipt/i.test(all) ? "Receipt" : null;
  // buyer (only when it reads cleanly)
  for (const l of lines) {
    const m = l.match(/\b(?:sold\s+to|customer\s+name|cust\.?\s*name|registered\s+name|delivered\s+to|received\s+from)\s*[:.]\s*(.{3,60})$/i);
    if (m && !JUNK(m[1]) && !/^(tin|address)/i.test(m[1])) { out.buyer_name = m[1].trim(); break; }
  }
  if (out.buyer_name) unsure.push("buyer_name");
  quality(lines, unsure, ["name", "date", "total", "doc_no"]);
  if (out.name && shortTokens(out.name) > 0.3) unsure.push("name");
  out.uncertain = [...new Set(unsure)];
  return out;
}

function shortTokens(s) { const w = s.split(/\s+/); return w.filter((x) => x.length <= 2).length / w.length; }
function quality(lines, unsure, keys) { const bad = lines.filter(JUNK).length / Math.max(1, lines.length); if (bad > 0.45) unsure.push(...keys); }

function parseZText(text) {
  const lines = cleanLines(text), unsure = [], out = { report_type: null, date: null, tin: null, name: null, min: null, terminal: null, first_or: null, last_or: null, vatable_sales: null, vat_amount: null, zero_rated: null, vat_exempt: null, net_sales: null, gross_sales: null };
  out.report_type = /z[\s\-]*read/i.test(text) ? "Z" : /x[\s\-]*read/i.test(text) ? "X" : null; if (!out.report_type) unsure.push("report_type");
  const t = findTin(lines); if (t) out.tin = t.tin; else unsure.push("tin");
  const nm = lines.slice(0, 5).find((l) => !JUNK(l) && !/\bTIN\b|tel|z[\s\-]*read|\bmin\b/i.test(l)); if (nm) out.name = nm.slice(0, 80); else unsure.push("name");
  const mm = text.match(/\bMIN\b[\s:#.\-]*([0-9][0-9\s]{7,})/i); if (mm) out.min = mm[1].replace(/\D/g, ""); else unsure.push("min");
  const zi = lines.findIndex((l) => /z[\s\-]*read/i.test(l));
  const near = zi >= 0 ? lines.slice(zi, zi + 6) : lines;
  const dt = findDate(near.filter((l) => !/printed/i.test(l))) || findDate(lines.filter((l) => !/printed/i.test(l)));
  if (dt) { out.date = dt.iso; if (dt.amb) unsure.push("date"); } else unsure.push("date");
  const endNo = text.match(/end(?:ing)?\s*(?:invoice|or|si)?\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([0-9]{4,})/i); if (endNo) out.last_or = endNo[1]; else unsure.push("last_or");
  const stNo = text.match(/(?:start(?:ing)?|begin(?:ning)?)\s*(?:invoice|or|si)?\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([0-9]{4,})/i); if (stNo) out.first_or = stNo[1];
  const tm = text.match(/terminal\s*(?:no\.?|#|number)?\s*[:.\-]?\s*([A-Za-z0-9\-]{1,10})/i); if (tm && !/^(no|number)$/i.test(tm[1])) out.terminal = tm[1];
  const get = (re, not, key) => { const v = amountOnLine(lines, re, not); out[key] = v; if (v == null) unsure.push(key); };
  get(/vat(?:able)?\s*sales?/i, /less|exempt|zero|net/i, "vatable_sales");
  get(/vat\s*amount|output\s*vat/i, /less/i, "vat_amount");
  get(/zero[\s\-]*rated/i, /less/i, "zero_rated");
  get(/vat[\s\-]*exempt/i, /less/i, "vat_exempt");
  get(/net\s*sales/i, null, "net_sales");
  const g = amountOnLine(lines, /gross\s*sales/i); out.gross_sales = g;
  quality(lines, unsure, ["vatable_sales", "vat_amount", "net_sales", "date"]);
  out.uncertain = [...new Set(unsure)];
  return out;
}
