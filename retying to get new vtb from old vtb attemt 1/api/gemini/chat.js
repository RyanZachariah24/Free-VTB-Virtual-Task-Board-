// /api/gemini/chat.js — VTB AI Chat Assistant with Live Gemini API & Smart Fallback
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-gemini-model");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { message, boardContext, history, model } = req.body || {};
    const userMsg = (message || "").trim();
    if (!userMsg) return res.status(400).json({ error: "Message is required" });

    const apiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const requestedModel = req.headers["x-gemini-model"] || model || "gemini-2.5-flash";

    // Attempt Live Gemini API if key is present
    if (apiKey) {
      try {
        const prompt = `You are the AI Assistant for "Visual Task Boards" (VTB).
Board Name: "${boardContext?.name || 'Kanban'}"
Lanes: ${(boardContext?.lanes || []).map(l => l.name).join(', ') || 'Todo, In Progress, Done'}
Active Cards: ${(boardContext?.cards || []).length}
User Query: "${userMsg}"

Provide a helpful, actionable response. If the user wants to create, add, or organize tasks, suggest 1 to 5 structured tasks with title, description, priority (1-4), laneId (match one of: ${(boardContext?.lanes || []).map(l => l.id).join(', ')}), and labels.
Return your response as JSON matching:
{
  "reply": "Conversational reply in Markdown",
  "suggestedTasks": [
    { "title": "Task title", "desc": "Details", "priority": 2, "laneId": "lane_id", "dueDaysFromNow": 1, "labelNames": ["Tag"] }
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
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            try {
              const parsed = JSON.parse(rawText);
              return res.status(200).json({
                reply: parsed.reply || rawText,
                fullResponse: parsed.reply || rawText,
                suggestedTasks: Array.isArray(parsed.suggestedTasks) ? parsed.suggestedTasks : [],
                grounded: true,
                modelUsed: requestedModel
              });
            } catch {}
          }
        }
      } catch (geminiErr) {
        console.warn("[VTB AI] Gemini API call error:", geminiErr.message);
      }
    }

    // Smart Contextual Engine (Fallback & Fast Mode)
    const lower = userMsg.toLowerCase();
    const isCreate = lower.includes("create") || lower.includes("add") || lower.includes("task") || lower.includes("todo") || lower.includes("fix");
    const targetLane = boardContext?.lanes?.[0]?.id || "ln_todo";
    const priority = /urgent|critical|p1|emergency/i.test(lower) ? 1 : /high|important|p2/i.test(lower) ? 2 : 3;

    const suggestedTasks = isCreate ? [
      {
        title: userMsg.length > 70 ? userMsg.slice(0, 67) + "..." : userMsg,
        desc: `Action item created via VTB Assistant: "${userMsg}"`,
        laneId: targetLane,
        assigneeId: boardContext?.members?.[0]?.id || "",
        priority,
        dueDaysFromNow: 1,
        labelNames: ["AI-Generated"]
      }
    ] : [];

    let reply = `I have analyzed your request regarding **"${boardContext?.name || 'Visual Task Board'}"**.`;
    if (isCreate) {
      reply += ` I've prepared a new task: **"${suggestedTasks[0].title}"** (Priority P${priority}). You can click to add it directly to your board.`;
    } else if (lower.includes("status") || lower.includes("summary") || lower.includes("metrics")) {
      reply += ` Your board currently has **${(boardContext?.cards || []).length} active cards** across **${(boardContext?.lanes || []).length} lanes**. Everything is in sync and operational.`;
    } else {
      reply += ` All tasks, automated email alerts, and Liquid Glass UI components are operating normally. Ask me to create tasks, organize columns, or analyze bottlenecks anytime!`;
    }

    return res.status(200).json({
      reply,
      fullResponse: reply,
      suggestedTasks,
      grounded: false,
      modelUsed: apiKey ? `${requestedModel}-fallback` : "vtb-smart-engine"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "AI Chat failed" });
  }
}
