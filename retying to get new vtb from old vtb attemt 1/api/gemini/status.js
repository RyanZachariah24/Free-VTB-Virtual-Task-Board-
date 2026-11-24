// /api/gemini/status.js — AI Suggested Presence Statuses
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-gemini-model");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { context } = req.body || {};
    const apiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const requestedModel = req.headers["x-gemini-model"] || "gemini-2.5-flash";

    if (apiKey) {
      try {
        const prompt = `Suggest 5 to 7 creative, modern presence statuses with emojis for a Kanban project management app.
Context: "${context || 'Software engineering, design, and product sync'}"

Return JSON matching:
{
  "statuses": [
    "Deep Work 🎧",
    "Sprint Planning 🚀",
    "Code Review 💻",
    "Deploying Release 🚢",
    "Customer Sync 💬"
  ]
}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${requestedModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" }
            })
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed.statuses) && parsed.statuses.length > 0) {
                return res.status(200).json({ statuses: parsed.statuses });
              }
            } catch {}
          }
        }
      } catch (geminiErr) {
        console.warn("[VTB Status] Gemini API error:", geminiErr.message);
      }
    }

    // Default creative statuses
    return res.status(200).json({
      statuses: [
        "Deep Focus 🎧",
        "Sprint Planning 🚀",
        "Code Review 💻",
        "Design Jam 🎨",
        "Testing & QA 🧪",
        "Deploying Release 🚢",
        "Taking a Coffee Break ☕"
      ]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Status generation failed" });
  }
}
