// Reads one receipt with Claude. The API key and the trial rules live here, never in the page.
// Environment variables (set in Netlify > Site configuration > Environment variables):
//   ACCESS_CODE        required, the trial code you give the client, e.g. JADJ-TRIAL
//   TRIAL_MAX          optional, receipts allowed in total (default 30)
//   TRIAL_EXPIRES      optional, last day of the trial as YYYY-MM-DD (default: no expiry)
//   PROVIDER           optional, "gemini" (default), "claude", or "openai" (any OpenAI-compatible service)
//   OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL  for PROVIDER=openai, e.g. base https://api.mistral.ai/v1 or https://openrouter.ai/api/v1 or https://api.groq.com/openai/v1
//   GEMINI_API_KEY     required when PROVIDER is gemini, free key from aistudio.google.com
//   GEMINI_FALLBACK_MODEL optional, default gemini-3.6-flash, tried when the main model is overloaded (503/429)
//   GEMINI_MODEL       optional, default gemini-3.8-flash (Google retires old model names, so if reading fails with a 404, set this to the current Flash name shown in AI Studio)
//   ANTHROPIC_API_KEY  required when PROVIDER is claude, key from console.anthropic.com
//   MODEL              optional, Claude model, default claude-sonnet-5-5
import { getStore } from "@netlify/blobs";

const PROMPT_PURCHASE = `The attached image or images show ONE receipt or invoice from the Philippines. It may be a printed POS receipt, a printed or booklet-style sales invoice, cash sales invoice, order slip, delivery receipt or collection receipt, and it may be handwritten. If several images are attached, they are overlapping slices of the same long receipt, in order from top to bottom: read them as one document.

An accounting office needs these details about the SELLER (the business that issued the document), taken from the header at the top. Reply with ONLY one JSON object, no other text.

Schema:
{
  "date": "YYYY-MM-DD" or null,
  "doc_no": string or null,
  "tin": string or null,
  "name": string or null,
  "address": string or null,
  "buyer_name": string or null,
  "buyer_tin": string or null,
  "total": number or null,
  "vat_type": "VAT" or "NON-VAT" or null,
  "doc_type": string or null,
  "not_valid_for_input_tax": true or false,
  "uncertain": [ names of fields you are not sure about ]
}

Rules:
- name: the seller's business name as printed at the top. If a proprietor is shown (for example "Juan Cruz - Prop."), add it in brackets after the business name. Never use the buyer ("Sold to", "Delivered to", "Received from", "Cust Name") and never use the printer of the booklet.
- address: the seller's address from the header, not the buyer's address and not the printer's.
- buyer_name and buyer_tin: the customer the document is made out to ("Sold to", "Customer", "Registered to", "Cust Name", "Received from") and the customer's TIN, exactly as printed. Use null when the document shows none, and never put the seller's own details here. If only a name is shown, buyer_tin is null.
- tin: the seller's TIN from the header, exactly as printed, for example "009-779-469-000". Ignore the TIN of the printer ("printing", "printers", "BIR Authority to Print" lines at the bottom) and the buyer's TIN.
- vat_type: "VAT" if the header says "VAT Reg" or "VAT Registered". "NON-VAT" if it says "NON-VAT Reg", "NON VAT" or similar for the seller. Otherwise null.
- doc_no: the document number: the Sales Invoice, Cash Sales Invoice, Order Slip, Delivery Receipt, Collection Receipt or OR number. For booklet documents this is the red or printed serial "No." (for example "1078991"). For POS receipts it is the invoice number (for example "04-00004161"), not the transaction, terminal, MIN or serial number.
- doc_type: for example "Sales Invoice", "Cash Sales Invoice", "Order Slip", "Delivery Receipt", "Collection Receipt", "Official Receipt".
- total: the gross total amount due or total paid, VAT inclusive, as a plain number with no currency symbol and no commas. Not the cash given, not the change, not the VAT amount.
- date: the date of the transaction as YYYY-MM-DD. Philippine dates are usually month first (MM/DD/YYYY or M-D-YY). A two digit year such as 26 means 2026. If the day and month could be swapped (both 12 or less) or the handwriting is unclear, add "date" to "uncertain".
- not_valid_for_input_tax: true only if the document says it is not valid for claiming input tax, otherwise false.
- Never guess. If something is unreadable, use null and add its name to "uncertain".
- If an image holds more than one separate receipt, read only the first and add "multiple_receipts" to "uncertain".`;

const PROMPT_SALE = `The attached image or images show ONE end-of-day sales report, called a "Z-Reading" or "Terminal Z-Reading", printed by a cash register or POS machine in the Philippines. The photo may be sideways or upside down: read it as if it were turned upright. If several images are attached, they are overlapping slices of the same long report, in order: read them as one document.

An accounting office needs these figures for its sales records. Reply with ONLY one JSON object, no other text.

Schema:
{
  "report_type": "Z" or "X" or other text,
  "date": "YYYY-MM-DD" or null,
  "tin": string or null,
  "name": string or null,
  "min": string or null,
  "terminal": string or null,
  "first_or": string or null,
  "last_or": string or null,
  "vatable_sales": number or null,
  "vat_amount": number or null,
  "zero_rated": number or null,
  "vat_exempt": number or null,
  "net_sales": number or null,
  "gross_sales": number or null,
  "uncertain": [ names of fields you are not sure about ]
}

Rules:
- date: the report date printed under "Z-READING" (the day the sales belong to), as YYYY-MM-DD. NOT the "Date Printed" line, which can be the next day.
- tin: the "VAT/TIN" or "TIN" at the top, exactly as printed with all digits, for example "429-501-834-000". The last three digits are the branch code.
- name: the business name at the top.
- min: the MIN (Machine Identification Number) printed in the header, digits only. Not the serial number (SN), not the PTU or permit number, not the accreditation number.
- last_or: the "End Invoice No" (also "End OR No" or "Ending Invoice"), the last invoice number of that day. Keep every leading zero, for example "00097521". first_or: the "Start Invoice No".
- vatable_sales: the "VAT Sales" amount. vat_amount: the "VAT Amount". zero_rated: the "Zero Rated" amount. vat_exempt: the "VAT Exempt Sales" amount in the same block as VAT Sales (not a "Less VAT Exempt" deduction line above).
- net_sales: the "Net Sales" amount. gross_sales: the "Gross Sales" amount.
- All amounts are plain numbers with no currency symbol and no commas. A printed 0.00 is the number 0.
- Never guess. If something is unreadable, use null and add its name to "uncertain". Do not do any arithmetic: copy the printed figures.
- If the image is an X-Reading or any report other than a Z-Reading, set report_type to what it says.`;

const PROMPTS = { purchase: PROMPT_PURCHASE, sale: PROMPT_SALE };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const env = process.env;
  const code = String(body.code || "").trim();
  if (!env.ACCESS_CODE || code.toLowerCase() !== env.ACCESS_CODE.trim().toLowerCase()) {
    return json({ error: "bad_code" }, 401);
  }

  const max = Number(env.TRIAL_MAX || 30);
  const expires = env.TRIAL_EXPIRES ? new Date(env.TRIAL_EXPIRES + "T23:59:59+08:00") : null;
  const store = getStore("trial");
  const key = "used:" + env.ACCESS_CODE.trim().toLowerCase();
  const used = Number(await store.get(key)) || 0;
  const info = { remaining: Math.max(0, max - used), max, expires: env.TRIAL_EXPIRES || null };

  if (expires && Date.now() > expires.getTime()) return json({ error: "expired", ...info, remaining: 0 }, 403);
  if (used >= max) return json({ error: "limit", ...info, remaining: 0 }, 403);

  if (body.action === "status") return json({ ok: true, ...info });

  const images = Array.isArray(body.images) ? body.images : [];
  if (!images.length || images.length > 4) return json({ error: "bad_images" }, 400);
  const total = images.reduce((a, s) => a + String(s).length, 0);
  if (total > 5_000_000) return json({ error: "too_big" }, 413);

  const provider = (env.PROVIDER || "gemini").toLowerCase();
  let res;
  try {
    if (provider === "claude") {
      if (!env.ANTHROPIC_API_KEY) return json({ error: "server_setup" }, 500);
      const content = images.map((b64) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: String(b64) }
      }));
      content.push({ type: "text", text: PROMPTS[body.kind === "sale" ? "sale" : "purchase"] });
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: env.MODEL || "claude-sonnet-5-5",
          max_tokens: 2000,
          messages: [{ role: "user", content }]
        })
      });
    } else if (provider === "openai") {
      // Any OpenAI-compatible service: OpenAI, Mistral, Groq, OpenRouter, etc.
      if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) return json({ error: "server_setup", detail: "OPENAI_API_KEY and OPENAI_MODEL are required" }, 500);
      const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      const content = images.map((b64) => ({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + String(b64) } }));
      content.push({ type: "text", text: PROMPTS[body.kind === "sale" ? "sale" : "purchase"] });
      res = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY },
        signal: AbortSignal.timeout(9000),
        body: JSON.stringify({ model: env.OPENAI_MODEL, temperature: 0, messages: [{ role: "user", content }] })
      });
    } else {
      if (!env.GEMINI_API_KEY) return json({ error: "server_setup" }, 500);
      const primary = env.GEMINI_MODEL || "gemini-3.8-flash";
      const fallback = env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
      const models = fallback && fallback !== primary ? [primary, fallback] : [primary];
      const parts = images.map((b64) => ({ inline_data: { mime_type: "image/jpeg", data: String(b64) } }));
      parts.push({ text: PROMPTS[body.kind === "sale" ? "sale" : "purchase"] });
      // Google sometimes answers 503 "high demand" or 429 for one model while another is free,
      // so if the first model is overloaded the next one is tried straight away.
      const t0 = Date.now();
      for (const model of models) {
        const left = 9000 - (Date.now() - t0);
        if (left < 1500) break;
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          signal: AbortSignal.timeout(left),
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2000, thinkingConfig: /^gemini-2/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" } }
          })
        });
        if (res.ok || ![429, 500, 503, 504].includes(res.status)) break;
        console.error("Model busy, trying next", model, res.status);
      }
    }
  } catch (e) {
    console.error("Fetch failed", e);
    const slow = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return json({ error: "upstream", detail: slow ? provider + " did not answer in time" : "could not reach " + provider }, 502);
  }
  if (!res) return json({ error: "upstream", detail: provider + " did not answer in time" }, 502);
  if (!res.ok) {
    let detail = "";
    try { const e = await res.json(); detail = (e.error && (e.error.message || e.error.status)) || ""; } catch {}
    console.error("Provider error", res.status, detail);
    return json({ error: (res.status === 429 || res.status === 503) ? "busy" : "upstream", detail: `${provider} ${res.status} ${String(detail).slice(0, 160)}`.trim() }, 502);
  }

  const out = await res.json();
  const text = provider === "claude"
    ? (out.content || []).map((c) => c.text || "").join("")
    : provider === "openai"
    ? String((out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) || "")
    : ((out.candidates && out.candidates[0] && out.candidates[0].content && out.candidates[0].content.parts) || [])
        .map((p) => p.text || "").join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  let data;
  try { data = JSON.parse(text.slice(a, b + 1)); } catch { return json({ error: "invalid_json" }, 502); }

  await store.set(key, String(used + 1));
  return json({ ok: true, data, remaining: Math.max(0, max - used - 1), max, expires: info.expires });
};
