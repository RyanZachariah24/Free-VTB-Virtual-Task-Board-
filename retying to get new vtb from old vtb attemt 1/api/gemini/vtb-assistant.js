// /api/gemini/vtb-assistant.js — VTB Board Metrics & Bottlenecks Analyzer
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-gemini-model");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { board, query } = req.body || {};
    const cards = Array.isArray(board?.cards) ? board.cards : [];
    const lanes = Array.isArray(board?.lanes) ? board.lanes : [];
    const members = Array.isArray(board?.members) ? board.members : [];

    const todayStr = new Date().toISOString().split("T")[0];
    const overdue = cards.filter(c => c.due && c.due.split("T")[0] < todayStr);
    const dueToday = cards.filter(c => c.due && c.due.split("T")[0] === todayStr);
    const unassigned = cards.filter(c => !c.assigneeId);
    const p1Tasks = cards.filter(c => c.priority === 1);

    const stats = {
      total: cards.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      unassigned: unassigned.length,
      critical: p1Tasks.length,
      lanesCount: lanes.length,
      membersCount: members.length
    };

    const apiKey = req.headers["x-gemini-api-key"] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const requestedModel = req.headers["x-gemini-model"] || "gemini-2.5-flash";

    if (apiKey) {
      try {
        const prompt = `You are the executive Kanban analytics assistant for "Visual Task Boards" (VTB).
Board Name: "${board?.name || 'Board'}"
Metrics:
- Total Tasks: ${stats.total}
- Overdue: ${stats.overdue}
- Due Today: ${stats.dueToday}
- Unassigned: ${stats.unassigned}
- Critical Priority (P1): ${stats.critical}
Lanes breakdown: ${lanes.map(l => `${l.name} (${cards.filter(c => c.laneId === l.id).length} cards${l.limit ? ', WIP limit: ' + l.limit : ''})`).join(', ')}
User Question: "${query || 'Provide a comprehensive board health and bottleneck report'}"

Write a concise, professional executive summary with bullet points highlighting bottlenecks, workload distribution, and recommended next steps.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${requestedModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer) {
            return res.status(200).json({ answer, modelUsed: requestedModel, stats });
          }
        }
      } catch (geminiErr) {
        console.warn("[VTB Assistant] Gemini API error:", geminiErr.message);
      }
    }

    // High quality offline fallback report
    let answer = `Here is the current board summary for **"${board?.name || 'Board'}"**:\n\n`;
    answer += `• **Total Active Tasks**: ${stats.total}\n`;
    answer += `• **Overdue Tasks**: ${stats.overdue > 0 ? `⚠️ **${stats.overdue} task(s) overdue** — immediate attention recommended.` : '✅ All tasks on schedule.'}\n`;
    answer += `• **Due Today**: ${stats.dueToday > 0 ? `📅 ${stats.dueToday} task(s) due today.` : 'None due today.'}\n`;
    answer += `• **Unassigned Work**: ${stats.unassigned > 0 ? `👤 ${stats.unassigned} task(s) need an assignee.` : '✅ All tasks assigned to team members.'}\n`;
    answer += `• **High Priority (P1)**: ${stats.critical} critical task(s).\n\n`;

    if (lanes.length > 0) {
      answer += `**Workflow Lanes Overview**:\n`;
      lanes.forEach(l => {
        const laneCards = cards.filter(c => c.laneId === l.id);
        const isClogged = l.limit && laneCards.length > l.limit;
        answer += `- **${l.name}**: ${laneCards.length} tasks ${isClogged ? `⚠️ *(Exceeds WIP limit of ${l.limit})*` : ''}\n`;
      });
    }

    answer += `\n💡 **Recommendation**: ${overdue.length > 0 ? 'Prioritize clearing overdue items first.' : unassigned.length > 0 ? 'Assign pending tasks to distribute team velocity.' : 'Board workflow is healthy and operating within ideal limits!'}`;

    return res.status(200).json({
      answer,
      modelUsed: apiKey ? `${requestedModel}-fallback` : "vtb-smart-engine",
      stats
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Board analysis failed" });
  }
}
