import { kv } from "@vercel/kv";

const KEY = "calamai-comms-v1";

/* Webhook per N8N. Payload accettati (anche combinati):
   { "kpis":     [ { "id": "ig_followers", "value": 512, "date": "2026-07-09" } ],
     "mentions": [ { "title": "...", "url": "https://...", "source": "Google Alerts", "date": "2026-07-09" } ] }
   Le menzioni vengono deduplicate per URL (o per titolo se senza URL). */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers["x-ingest-key"] !== process.env.INGEST_KEY) {
    return res.status(401).json({ error: "Non autorizzato" });
  }

  const { kpis, mentions } = req.body || {};
  if (!Array.isArray(kpis) && !Array.isArray(mentions)) {
    return res.status(400).json({ error: "Formato atteso: { kpis: [...] } e/o { mentions: [...] }" });
  }

  const data = (await kv.get(KEY)) || {};
  data.kpis = data.kpis || [];
  data.mentions = data.mentions || [];

  let addedKpis = 0;
  if (Array.isArray(kpis)) {
    for (const k of kpis) {
      if (!k.id || k.value == null) continue;
      data.kpis.push({
        id: k.id,
        value: parseFloat(k.value),
        date: k.date || new Date().toISOString().slice(0, 10),
        ts: Date.now() + addedKpis,
      });
      addedKpis++;
    }
  }

  let addedMentions = 0;
  if (Array.isArray(mentions)) {
    const seen = new Set(data.mentions.map((m) => (m.url || m.title || "").toLowerCase().trim()));
    for (const m of mentions) {
      if (!m.title) continue;
      const dedupeKey = (m.url || m.title).toLowerCase().trim();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      data.mentions.unshift({
        id: Math.random().toString(36).slice(2, 10),
        title: String(m.title).slice(0, 300),
        url: m.url || "",
        source: m.source || "Google Alerts",
        date: m.date || new Date().toISOString().slice(0, 10),
        addedAt: new Date().toISOString(),
        sentiment: null,
        relevance: null,
        note: null,
      });
      addedMentions++;
    }
    // tetto di sicurezza per non far crescere il record all'infinito
    if (data.mentions.length > 500) data.mentions = data.mentions.slice(0, 500);
  }

  await kv.set(KEY, data);
  return res.status(200).json({ ok: true, addedKpis, addedMentions });
}
