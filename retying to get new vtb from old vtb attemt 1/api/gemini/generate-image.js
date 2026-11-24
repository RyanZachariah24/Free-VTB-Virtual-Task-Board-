// /api/gemini/generate-image.js — Card Cover & Theme Image Generator
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-gemini-model");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, style } = req.body || {};
    const title = (prompt || "Kanban Task").slice(0, 50);

    // Generate high quality modern vector graphic (SVG data URI)
    const gradients = [
      ["#2563EB", "#7C3AED"],
      ["#059669", "#0284C7"],
      ["#D97706", "#DC2626"],
      ["#4F46E5", "#06B6D4"],
      ["#0F172A", "#334155"]
    ];
    const [c1, c2] = gradients[Math.floor(Math.random() * gradients.length)];

    const svg = `<svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="100%" stop-color="${c2}" />
    </linearGradient>
    <filter id="f" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="600" height="340" fill="url(#g)" />
  <circle cx="520" cy="60" r="140" fill="rgba(255,255,255,0.08)" />
  <circle cx="80" cy="280" r="180" fill="rgba(255,255,255,0.06)" />
  <g filter="url(#f)">
    <rect x="50" y="70" width="500" height="200" rx="20" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
    <text x="300" y="150" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">${title.replace(/[<&>]/g, '')}</text>
    <text x="300" y="195" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="14" font-weight="600" fill="rgba(255,255,255,0.8)" text-anchor="middle">Visual Task Boards • Pro Card Cover</text>
  </g>
</svg>`;

    const imageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    return res.status(200).json({
      imageUrl,
      source: "vtb-vector-engine"
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Image generation failed" });
  }
}
