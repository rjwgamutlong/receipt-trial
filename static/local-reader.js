// ---- Static (no server) mode: the photo is read inside the phone, then plain code fills the fields. ----
// Change these three lines for each trial.
const LOCAL_TRIAL = { code: 'JADJ-TRIAL', max: 30, expires: '2026-11-15' };
const TESS_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
const TESS_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/';
const TESS_LANG = 'https://tessdata.projectnaptha.com/4.0.0_fast';
let _tw = null;
async function getOcr() {
  if (_tw) return _tw;
  const cfg = window.TESS_CFG || { workerPath: TESS_BASE + 'worker.min.js', corePath: TESS_CORE, langPath: TESS_LANG };
  const w = await Tesseract.createWorker('eng', 1, cfg);
  await w.setParameters({ tessedit_pageseg_mode: '6' });
  return (_tw = w);
}
async function ocrParts(parts) {
  const w = await getOcr(), out = [];
  for (const b64 of parts) { const r = await w.recognize('data:image/jpeg;base64,' + b64); out.push(r.data.text || ''); }
  return out.join('\n');
}
/*RULES*/
function _used() { try { return Number(localStorage.getItem('trialUsed:' + LOCAL_TRIAL.code.toLowerCase())) || 0; } catch (e) { return 0; } }
function _info() { return { remaining: Math.max(0, LOCAL_TRIAL.max - _used()), max: LOCAL_TRIAL.max, expires: LOCAL_TRIAL.expires }; }
async function callApi(payload, signal) {
  if (String(payload.code || '').trim().toLowerCase() !== LOCAL_TRIAL.code.toLowerCase()) throw { code: 'bad_code' };
  if (LOCAL_TRIAL.expires && Date.now() > new Date(LOCAL_TRIAL.expires + 'T23:59:59+08:00').getTime()) throw { code: 'expired', info: _info() };
  if (_used() >= LOCAL_TRIAL.max) throw { code: 'limit', info: _info() };
  if (payload.action === 'status') return { ok: true, ..._info() };
  let text;
  try { text = await ocrParts(payload.images); }
  catch (e) { throw { code: 'upstream', info: { detail: 'the text reader could not start, check the phone signal and try again' } }; }
  if (signal && signal.aborted) throw { code: 'cancelled' };
  if (text.trim().length < 20) throw { code: 'upstream', info: { detail: 'no readable text found in this photo' } };
  const data = payload.kind === 'sale' ? parseZText(text) : parsePurchaseText(text);
  try { localStorage.setItem('trialUsed:' + LOCAL_TRIAL.code.toLowerCase(), String(_used() + 1)); } catch (e) {}
  return { ok: true, via: 'local', data, ..._info() };
}
