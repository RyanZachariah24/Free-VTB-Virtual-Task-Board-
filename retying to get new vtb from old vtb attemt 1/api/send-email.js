const DATABASE_ID = "ai-studio-visualtaskboards-101e6baa-1842-477c-a448-5adc2889fa4c";
const DAILY_GMAIL_LIMIT = 500;
const QUOTA_DOC_PATH = "_system/emailQuota";

let fbAppMod = null, fbAuthMod = null, fbFsMod = null, nodemailerMod = null;

async function loadDeps() {
  if (!nodemailerMod) {
    try { const mod = await import("nodemailer"); nodemailerMod = mod.default || mod; } catch {}
  }
  if (!fbAppMod && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      [fbAppMod, fbAuthMod, fbFsMod] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
        import("firebase-admin/firestore")
      ]);
    } catch (e) {
      console.warn("[VTB Email] Firebase admin package load skipped:", e.message);
    }
  }
}

async function getAdmin() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  await loadDeps();
  if (!fbAppMod) return null;
  try {
    if (!fbAppMod.getApps().length) {
      fbAppMod.initializeApp({ credential: fbAppMod.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
    }
    const app = fbAppMod.getApps()[0];
    return { adminAuth: fbAuthMod.getAuth(app), adminDb: fbFsMod.getFirestore(app, DATABASE_ID) };
  } catch (err) {
    console.warn("[VTB Email] Firebase Admin init failed:", err.message);
    return null;
  }
}

function getQuotaDateKey(ts = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ts));
}

function isGmailQuotaErr(err) {
  const txt = `${err?.response || ""} ${err?.message || ""}`.toLowerCase();
  return err?.responseCode === 550 || err?.responseCode === 429 || txt.includes("5.4.5") || txt.includes("quota") || txt.includes("limit exceeded");
}

async function sendViaGmail({ toEmail, subject, message }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("Gmail credentials not configured");
  }
  await loadDeps();
  if (!nodemailerMod) throw new Error("Nodemailer not available");
  const transporter = nodemailerMod.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `"Free Vtb Virtual Task Board" <${process.env.GMAIL_USER}>`,
    to: toEmail, subject, text: message,
    html: `<div style="font-family:sans-serif;line-height:1.5;white-space:pre-wrap;">${message}</div>`,
  });
}

async function sendViaEmailJS(p) {
  if (!process.env.EMAILJS_SERVICE_ID || !process.env.EMAILJS_TEMPLATE_ID) {
    throw new Error("EmailJS credentials not configured");
  }
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: {
        to_email: p.toEmail, to_name: p.toName || p.toEmail, user_name: p.toName || p.toEmail,
        task_title: p.taskTitle || "", board_name: p.boardName || "Free Vtb Virtual Task Board",
        invite_link: p.inviteLink || "", message: p.message,
      },
    }),
  });
  if (!res.ok) throw new Error(`EmailJS failed (${res.status}): ${await res.text()}`);
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const payload = req.body || {};
    const toEmail = payload.toEmail || payload.to || "";
    const message = payload.message || payload.text || "";
    const subject = payload.subject || `[Free Vtb Virtual Task Board] ${payload.boardName || "Notification"}`;

    if (!toEmail) return res.status(400).json({ error: "toEmail required" });

    const admin = await getAdmin();
    if (admin) {
      const hdr = req.headers.authorization || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
      if (token) {
        try { await admin.adminAuth.verifyIdToken(token); } catch {}
      }
    }

    // Attempt 1: Gmail if configured
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        await sendViaGmail({ toEmail, subject, message });
        return res.status(200).json({ ok: true, provider: "gmail", message: `Sent to ${toEmail}` });
      } catch (err) {
        console.warn("[VTB Email] Gmail send failed, falling back:", err.message);
      }
    }

    // Attempt 2: EmailJS if configured
    if (process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_TEMPLATE_ID) {
      try {
        await sendViaEmailJS({ ...payload, toEmail, subject, message });
        return res.status(200).json({ ok: true, provider: "emailjs", message: `Sent to ${toEmail}` });
      } catch (err) {
        console.warn("[VTB Email] EmailJS send failed:", err.message);
      }
    }

    // Fallback: Return successful queue record for client mailto / local outbox
    return res.status(200).json({
      ok: true,
      provider: "outbox",
      message: `Email queued for ${toEmail}. Open Mail App to dispatch immediately.`,
      mailto: `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Send failed" });
  }
}

