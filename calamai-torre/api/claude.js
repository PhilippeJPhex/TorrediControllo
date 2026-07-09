import { checkAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!checkAuth(req)) return res.status(401).json({ error: "Non autorizzato" });

  const { prompt, useSearch = false, maxTokens = 1500 } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "prompt mancante" });

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: Math.min(4000, maxTokens),
    messages: [{ role: "user", content: prompt }],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    // Con la web search il testo arriva frammentato in più blocchi: li uniamo.
    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
