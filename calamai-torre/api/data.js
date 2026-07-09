import { kv } from "@vercel/kv";
import { checkAuth } from "./_auth.js";

const KEY = "calamai-comms-v1";
const EMPTY = { activities: {}, kpis: [], plan: null, ispo: null };

export default async function handler(req, res) {
  if (!checkAuth(req)) return res.status(401).json({ error: "Non autorizzato" });

  if (req.method === "GET") {
    const data = await kv.get(KEY);
    return res.status(200).json(data || EMPTY);
  }
  if (req.method === "POST") {
    await kv.set(KEY, req.body || EMPTY);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
