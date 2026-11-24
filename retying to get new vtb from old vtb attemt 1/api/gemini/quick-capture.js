// /api/gemini/quick-capture.js — Natural Language Quick Task Parsing
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-gemini-model");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text, input: bodyInput, prompt: bodyPrompt, message: bodyMessage, lanes, members } = req.body || {};
    const input = (text || bodyInput || bodyPrompt || bodyMessage || "").trim();
    if (!input) return res.status(400).json({ error: "Text is required" });

    const availableLanes = Array.isArray(lanes) ? lanes : [];
    const availableMembers = Array.isArray(members) ? members : [];
    const apiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const requestedModel = req.headers["x-gemini-model"] || "gemini-2.5-flash";

    if (apiKey) {
      try {
        const prompt = `Parse this raw text into a single structured Kanban task:
"${input}"

Available Lanes: ${availableLanes.map(l => `${l.name} (id: ${l.id})`).join(', ') || 'Todo'}
Available Team Members: ${availableMembers.map(m => `${m.name} (id: ${m.id})`).join(', ') || 'None'}
Today's Date: ${new Date().toISOString().split('T')[0]}

Extract:
- title: concise summary (max 60 chars)
- desc: additional notes or context
- priority: 1 (Urgent/Critical), 2 (High), 3 (Medium), 4 (Low)
- assigneeId: id of matched member, or ""
- dueDate: YYYY-MM-DD or ""
- laneId: id of best matching lane, or default to first lane
- labelNames: array of string tags (e.g. ["Bug", "Frontend", "Feature"])

Return strictly JSON format:
{
  "title": "...",
  "desc": "...",
  "priority": 3,
  "assigneeId": "",
  "dueDate": "",
  "laneId": "",
  "labelNames": []
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
              return res.status(200).json({
                title: parsed.title || input.slice(0, 60),
                desc: parsed.desc || "",
                priority: Number(parsed.priority) || 3,
                assigneeId: parsed.assigneeId || "",
                dueDate: parsed.dueDate || "",
                laneId: parsed.laneId || availableLanes[0]?.id || "",
                labelNames: Array.isArray(parsed.labelNames) ? parsed.labelNames : ["QuickCapture"]
              });
            } catch {}
          }
        }
      } catch (geminiErr) {
        console.warn("[VTB QuickCapture] Gemini API error:", geminiErr.message);
      }
    }

    // Smart regex parser fallback
    const isUrgent = /urgent|critical|asap|p1|emergency|immediately/i.test(input);
    const isHigh = /high|important|p2/i.test(input);
    const priority = isUrgent ? 1 : isHigh ? 2 : 3;

    // Detect matched member
    let assigneeId = "";
    for (const m of availableMembers) {
      if (m.name && new RegExp(`\\b${m.name}\\b`, 'i').test(input)) {
        assigneeId = m.id;
        break;
      }
    }

    // Detect matched lane
    let laneId = availableLanes[0]?.id || "";
    for (const l of availableLanes) {
      if (l.name && new RegExp(`\\b${l.name}\\b`, 'i').test(input)) {
        laneId = l.id;
        break;
      }
    }

    // Detect due date
    let dueDate = "";
    if (/tomorrow/i.test(input)) {
      dueDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    } else if (/today/i.test(input)) {
      dueDate = new Date().toISOString().split('T')[0];
    }

    const labels = ["QuickCapture"];
    if (/bug|fix|error|broken/i.test(input)) labels.push("Bug");
    if (/design|ui|css|style/i.test(input)) labels.push("Design");
    if (/backend|api|server|db/i.test(input)) labels.push("Backend");

    return res.status(200).json({
      title: input.length > 60 ? input.slice(0, 57) + "..." : input,
      desc: input,
      priority,
      assigneeId,
      dueDate,
      laneId,
      labelNames: labels
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Quick capture failed" });
  }
}
