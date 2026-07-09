import { kv } from "@vercel/kv";

const KEY = "calamai-comms-v1";

// Webhook per N8N. Payload atteso:
// { "kpis": [ { "id": "ig_followers", "value": 512, "date": "2026-07-09" } ] }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers["x-ingest-key"] !== process.env.INGEST_KEY) {
    return res.status(401).json({ error: "Non autorizzato" });
  }

  const { kpis } = req.body || {};
  if (!Array.isArray(kpis)) return res.status(400).json({ error: "Formato atteso: { kpis: [...] }" });

  const data = (await kv.get(KEY)) || { activities: {}, kpis: [], plan: null, ispo: null };
  let added = 0;
  for (const k of kpis) {
    if (!k.id || k.value == null) continue;
    data.kpis.push({
      id: k.id,
      value: parseFloat(k.value),
      date: k.date || new Date().toISOString().slice(0, 10),
      ts: Date.now() + added, // ts univoco anche in batch
    });
    added++;
  }

  await kv.set(KEY, data);
  return res.status(200).json({ ok: true, added });
}
