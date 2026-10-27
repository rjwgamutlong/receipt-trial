// Reads one receipt with Claude. The API key and the trial rules live here, never in the page.
// Environment variables (set in Netlify > Site configuration > Environment variables):
//   ANTHROPIC_API_KEY  required, your key from console.anthropic.com
//   ACCESS_CODE        required, the trial code you give the client, e.g. JADJ-TRIAL
//   TRIAL_MAX          optional, receipts allowed in total (default 30)
//   TRIAL_EXPIRES      optional, last day of the trial as YYYY-MM-DD (default: no expiry)
//   MODEL              optional, default claude-sonnet-5-5
import { getStore } from "@netlify/blobs";

const PROMPT = `The attached image or images show ONE receipt from the Philippines. It may be a printed POS receipt, a printed official receipt, or a handwritten one. If several images are attached, they are overlapping slices of the same long receipt, in order from top to bottom: read them as one receipt and do not count an item twice where the slices overlap. The business name, TIN and receipt or invoice number are usually in the first slice, and the totals in the last. Read it and reply with ONLY one JSON object, no other text.

Schema:
{
  "receipt_type": "printed" or "handwritten",
  "vendor": string or null,
  "tin": string or null,
  "date": "YYYY-MM-DD" or null,
  "receipt_no": string or null,
  "payment": string or null,
  "subtotal": number or null,
  "vat": number or null,
  "total": number or null,
  "items": [ { "description": string, "qty": number or null, "unit_price": number or null, "amount": number or null } ],
  "uncertain": [ names of fields you are not sure about ]
}

Rules:
- Numbers are plain numbers: no currency symbol, no thousands commas.
- Never guess. If something is unreadable, use null and add its name to "uncertain".
- Item fields in "uncertain" use the form "items.0.amount" or "items.2.description" (zero based).
- Top level fields use their own name, for example "date" or "total".
- Keep item descriptions as written on the receipt.
- If an image holds more than one separate receipt, read only the first and add "multiple_receipts" to "uncertain".`;

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

  if (!env.ANTHROPIC_API_KEY) return json({ error: "server_setup" }, 500);

  const content = images.map((b64) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: String(b64) }
  }));
  content.push({ type: "text", text: PROMPT });

  let res;
  try {
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
  } catch {
    return json({ error: "upstream" }, 502);
  }
  if (!res.ok) return json({ error: res.status === 429 ? "busy" : "upstream" }, 502);

  const out = await res.json();
  const text = (out.content || []).map((c) => c.text || "").join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  let data;
  try { data = JSON.parse(text.slice(a, b + 1)); } catch { return json({ error: "invalid_json" }, 502); }

  await store.set(key, String(used + 1));
  return json({ ok: true, data, remaining: Math.max(0, max - used - 1), max, expires: info.expires });
};
