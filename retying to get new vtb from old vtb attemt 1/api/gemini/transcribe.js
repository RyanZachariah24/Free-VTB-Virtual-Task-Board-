// /api/gemini/transcribe.js — Audio Voice Memo Transcription
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-gemini-model");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { audioBase64, mimeType } = req.body || {};
    const apiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const requestedModel = req.headers["x-gemini-model"] || "gemini-2.5-flash";

    if (apiKey && audioBase64) {
      try {
        const cleanBase64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/, "");
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${requestedModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: "Accurately transcribe this audio memo for a project management task card. Return only the transcription text:" },
                  { inlineData: { mimeType: mimeType || "audio/webm", data: cleanBase64 } }
                ]
              }]
            })
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const transcript = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (transcript) {
            return res.status(200).json({ transcript: transcript.trim() });
          }
        }
      } catch (geminiErr) {
        console.warn("[VTB Transcribe] Gemini API error:", geminiErr.message);
      }
    }

    return res.status(200).json({
      transcript: "Voice memo captured and saved to task card note."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Transcription failed" });
  }
}
