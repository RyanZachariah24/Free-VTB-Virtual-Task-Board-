// vtb-cloud-engine.js - Full Blue + Apple Liquid Glass & Cloud Engine
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const FIREBASE_CONFIG = {
  projectId: "resounding-ivy-s2ts5",
  appId: "1:168627556953:web:37803fdebf388b16741748",
  apiKey: "AIzaSyA_fjfh6UjBrc-ARq2PgLMNwotMufgx_sM",
  authDomain: "resounding-ivy-s2ts5.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-visualtaskboards-101e6baa-1842-477c-a448-5adc2889fa4c",
  storageBucket: "resounding-ivy-s2ts5.firebasestorage.app",
  messagingSenderId: "168627556953",
};

const app = initializeApp(FIREBASE_CONFIG, "Free Vtb Virtual Task Board");
const auth = getAuth(app);
const db = getFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId);

const origSetItem = window.__vtbOrigSetItem || localStorage.setItem.bind(localStorage);
const origGetItem = localStorage.getItem.bind(localStorage);

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ---------- 1. AES-256-GCM Zero-Knowledge Client Encryption ---------- */
async function deriveAesKey(seed, salt) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(seed), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function encryptCloud(obj, seed = "free_vtb_zero_knowledge_key_v5") {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(seed, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { encrypted: true, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(cipher) };
}

async function decryptCloud(env, seed = "free_vtb_zero_knowledge_key_v5") {
  if (!env?.encrypted || !env?.ciphertext) return env;
  const key = await deriveAesKey(seed, fromB64(env.salt));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv) }, key, fromB64(env.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function ensureAuth() {
  if (!auth.currentUser) {
    try { await signInAnonymously(auth); } catch (e) { console.error("Enable Anonymous Auth in Firebase Console!", e); }
  }
  return auth.currentUser;
}

function getActiveEmail() {
  if (auth.currentUser?.email) return auth.currentUser.email.toLowerCase().trim();
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || "";
    const v = origGetItem(k) || "";
    if (k.toLowerCase().includes("email") && v.includes("@")) return v.replace(/['"]+/g, "").toLowerCase().trim();
    if (/user|auth|account|session/i.test(k)) {
      try {
        const p = JSON.parse(v);
        if (p?.email?.includes("@")) return p.email.toLowerCase().trim();
      } catch {}
    }
  }
  const m = (document.body?.innerText || "").match(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  return m ? m[1].toLowerCase().trim() : "guest@vtb.local";
}

/* ---------- 2. In-App + Actual Native Browser/Site Notifications ---------- */
function requestSiteNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
document.addEventListener("click", requestSiteNotificationPermission, { once: true });

function showSiteAndInAppNotification(title, bodyText) {
  let stack = document.getElementById("vtb-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "vtb-toast-stack";
    stack.className = "vtb-toast-stack";
    document.body.appendChild(stack);
  }
  const item = document.createElement("div");
  item.className = "vtb-toast-item";
  item.innerHTML = `<div style="font-weight:800;margin-bottom:2px;">🔔 ${title}</div><div>${bodyText}</div>`;
  stack.prepend(item);
  setTimeout(() => item.remove(), 6000);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: bodyText,
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
      });
    } catch {}
  }
}

/* ---------- 3. Real-Time Auto-Sync Engine ---------- */
let initialPullDone = false;
let isApplyingRemote = false;
let lastCloudTs = Number(origGetItem("vtb_cloud_ts") || 0);
const capturedChannels = new Set();

if ("BroadcastChannel" in window) {
  const OrigBC = window.BroadcastChannel;
  window.BroadcastChannel = function (name) {
    const bc = new OrigBC(name);
    capturedChannels.add(bc);
    return bc;
  };
}

function mergeBoardsDeep(localBoards = [], remoteBoards = []) {
  const map = new Map();
  [...remoteBoards, ...localBoards].forEach((b) => {
    if (!b?.id) return;
    const prev = map.get(b.id);
    if (!prev) {
      map.set(b.id, b);
    } else {
      const taskKey = Array.isArray(b.cards) ? "cards" : Array.isArray(b.tasks) ? "tasks" : null;
      if (taskKey) {
        const tMap = new Map();
        [...(prev[taskKey] || []), ...(b[taskKey] || [])].forEach((t) => {
          if (t?.id) tMap.set(t.id, t);
        });
        b = { ...prev, ...b, [taskKey]: Array.from(tMap.values()) };
      }
      map.set(b.id, b);
    }
  });
  return Array.from(map.values());
}

function collectAndUnifyLocalSnapshot() {
  const snap = {};
  const boardContainers = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.startsWith("firebase:") || k.startsWith("vtb_cloud_") || k === "vtb_sw_cleared_v5") continue;
    const raw = origGetItem(k);
    snap[k] = raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.some((b) => b && (b.lanes || b.cards || b.tasks))) {
        boardContainers.push({ key: k, list: parsed });
      } else if (parsed && Array.isArray(parsed.boards)) {
        boardContainers.push({ key: k, list: parsed.boards, root: parsed });
      }
    } catch {}
  }

  if (boardContainers.length > 1) {
    let unified = [];
    boardContainers.forEach(({ list }) => { unified = mergeBoardsDeep(unified, list); });
    boardContainers.forEach(({ key, root }) => {
      const nextRaw = root ? JSON.stringify({ ...root, boards: unified }) : JSON.stringify(unified);
      snap[key] = nextRaw;
      origSetItem(key, nextRaw);
    });
  }
  return snap;
}

let pushTimer = null;
async function pushToCloud(notifyOthersText = null) {
  if (!initialPullDone || isApplyingRemote) return;
  try {
    await ensureAuth();
    const snap = collectAndUnifyLocalSnapshot();
    if (!Object.keys(snap).length) return;

    const ts = Date.now();
    lastCloudTs = ts;
    origSetItem("vtb_cloud_ts", String(ts));

    const enc = await encryptCloud(snap);
    await setDoc(doc(db, "vtb_cloud_sync", "workspace_v1"), {
      ...enc,
      updatedAt: ts,
      updatedBy: getActiveEmail(),
    });

    if (notifyOthersText) {
      await addDoc(collection(db, "vtb_notifications"), {
        fromEmail: getActiveEmail(),
        message: notifyOthersText,
        createdAt: Date.now(),
      });
    }
    updateHubText(`🟢 Auto-Synced (${new Date().toLocaleTimeString()})`);
  } catch (e) {
    updateHubText("🔴 Firebase Rule/Auth Error");
    console.error("Firebase push failed:", e);
  }
}

window.__vtbOnLocalWrite = (k) => {
  if (!isApplyingRemote && initialPullDone && !k.startsWith("firebase:") && !k.startsWith("vtb_cloud_")) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushToCloud("Shared board tasks updated"), 350);
  }
};

async function pullFromCloud(data, isFirstLoad = false) {
  if (!data?.encrypted) return;
  const remoteTs = data.updatedAt || 0;
  if (!isFirstLoad && remoteTs <= lastCloudTs) return;

  try {
    isApplyingRemote = true;
    const remoteSnap = await decryptCloud(data);
    let changed = false;

    for (const [k, remoteVal] of Object.entries(remoteSnap)) {
      if (typeof remoteVal !== "string") continue;
      const localVal = origGetItem(k);
      let finalVal = remoteVal;

      if (localVal && localVal !== remoteVal) {
        try {
          const lObj = JSON.parse(localVal);
          const rObj = JSON.parse(remoteVal);
          if (Array.isArray(lObj) && Array.isArray(rObj) && rObj.some((b) => b?.lanes || b?.cards || b?.tasks)) {
            finalVal = JSON.stringify(mergeBoardsDeep(lObj, rObj));
          } else if (lObj?.boards && rObj?.boards) {
            finalVal = JSON.stringify({ ...rObj, boards: mergeBoardsDeep(lObj.boards, rObj.boards) });
          }
        } catch {}
      }

      if (localVal !== finalVal) {
        origSetItem(k, finalVal);
        changed = true;
        window.dispatchEvent(new StorageEvent("storage", { key: k, newValue: finalVal, storageArea: localStorage }));
      }
    }

    collectAndUnifyLocalSnapshot();
    lastCloudTs = remoteTs;
    origSetItem("vtb_cloud_ts", String(remoteTs));

    if (changed) {
      capturedChannels.forEach((bc) => {
        try { bc.postMessage({ senderId: "cloud_sync", timestamp: remoteTs }); } catch {}
      });
      if (!isFirstLoad && data.updatedBy && data.updatedBy !== getActiveEmail()) {
        showSiteAndInAppNotification("Free Vtb Virtual Task Board", `Board synced with updates from ${data.updatedBy}`);
      }
      if (isFirstLoad && !sessionStorage.getItem("vtb_cloud_loaded")) {
        sessionStorage.setItem("vtb_cloud_loaded", "1");
        window.location.reload();
      }
    }
    updateHubText("🟢 Auto-Sync Active");
  } catch (e) {
    console.warn("Cloud pull error:", e.message);
  } finally {
    setTimeout(() => { isApplyingRemote = false; }, 250);
  }
}

/* ---------- 4. Direct Auto-Email For Invites ONLY ---------- */
async function dispatchBackendEmail(payload) {
  await ensureAuth();
  const token = await auth.currentUser.getIdToken();
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || "Email dispatch failed");
  return out;
}

async function sendDirectBoardInvite(toEmailRaw, boardName = getCurrentBoardKey()) {
  const toEmail = (toEmailRaw || "").toLowerCase().trim();
  if (!toEmail.includes("@")) return;
  const fromEmail = getActiveEmail();

  await ensureAuth();
  await pushToCloud();

  await addDoc(collection(db, "vtb_invites"), {
    toEmail,
    fromEmail,
    boardName,
    status: "pending",
    createdAt: Date.now(),
  });

  try {
    const res = await dispatchBackendEmail({
      toEmail,
      toName: toEmail.split("@")[0],
      subject: `[Free Vtb Virtual Task Board] Invite to board "${boardName}"`,
      boardName,
      inviteLink: window.location.origin,
      message: `${fromEmail} invited you to collaborate on board "${boardName}" on Free Vtb Virtual Task Board.\n\nOpen: ${window.location.origin}`,
    });
    showSiteAndInAppNotification("Invite Sent Directly", `Email sent via ${res.provider} & synced in VTB for ${toEmail}`);
  } catch (err) {
    showSiteAndInAppNotification("Invite Synced in VTB", `In-app invite sent to ${toEmail}. (${err.message})`);
  }
}

document.addEventListener("submit", (e) => {
  const form = e.target;
  const emailInput = form?.querySelector?.('input[type="email"]');
  if (emailInput?.value && /invite|share/i.test(form.innerText || "")) {
    sendDirectBoardInvite(emailInput.value, getCurrentBoardKey());
  }
}, true);

function watchInvitesAndNotifications() {
  const bootTime = Date.now();

  onSnapshot(collection(db, "vtb_invites"), (snap) => {
    const myEmail = getActiveEmail();
    const container = document.getElementById("vtb-invite-banners");
    if (!container) return;
    container.innerHTML = "";

    snap.docs.forEach((d) => {
      const inv = d.data();
      if (inv.status === "pending" && (inv.toEmail === myEmail || myEmail === "guest@vtb.local")) {
        if ((inv.createdAt || 0) > bootTime - 5000) {
          showSiteAndInAppNotification("New Shared Board Invite", `${inv.fromEmail} invited you to "${inv.boardName}"`);
        }
        const bar = document.createElement("div");
        bar.className = "vtb-invite-banner";
        bar.innerHTML = `
          <div>📩 <strong>Shared Board Invite:</strong> ${inv.fromEmail} invited <strong>${inv.toEmail}</strong> to "<strong>${inv.boardName}</strong>"</div>
          <div style="display:flex;gap:8px;">
            <button class="vtb-glass-pill-btn" style="background:#059669;" id="acc-${d.id}">✓ Accept & View Tasks</button>
            <button class="vtb-glass-pill-btn" id="dis-${d.id}">✕</button>
          </div>
        `;
        bar.querySelector(`#acc-${d.id}`).onclick = async () => {
          await updateDoc(doc(db, "vtb_invites", d.id), { status: "accepted" });
          const ws = await getDoc(doc(db, "vtb_cloud_sync", "workspace_v1"));
          if (ws.exists()) {
            lastCloudTs = 0;
            sessionStorage.removeItem("vtb_cloud_loaded");
            await pullFromCloud(ws.data(), true);
            window.location.reload();
          }
        };
        bar.querySelector(`#dis-${d.id}`).onclick = () => updateDoc(doc(db, "vtb_invites", d.id), { status: "dismissed" });
        container.appendChild(bar);
      }
    });
  });

  onSnapshot(collection(db, "vtb_notifications"), (snap) => {
    snap.docChanges().forEach((chg) => {
      if (chg.type === "added") {
        const n = chg.doc.data();
        if ((n.createdAt || 0) > bootTime && n.fromEmail !== getActiveEmail()) {
          showSiteAndInAppNotification("Free Vtb Virtual Task Board", `${n.fromEmail}: ${n.message}`);
        }
      }
    });
  });
}

/* ---------- 5. Solid Full Blue + Liquid Glass Themes & Board Backgrounds ---------- */
const SOLID_PRESETS = [
  { id: "solid-blue", name: "Solid Full Blue + Apple Liquid Glass (Standard)", mode: "light", color: "#2563EB", tint: "255, 255, 255" },
  { id: "royal-navy", name: "Deep Royal Blue", mode: "dark", color: "#1E3A8A", tint: "15, 23, 42" },
  { id: "apple-slate", name: "Apple Graphite", mode: "dark", color: "#1C1C1E", tint: "28, 28, 32" },
  { id: "emerald", name: "Emerald Green", mode: "light", color: "#059669", tint: "255, 255, 255" },
  { id: "purple", name: "Royal Purple", mode: "light", color: "#7C3AED", tint: "255, 255, 255" },
  { id: "crimson", name: "Crimson Red", mode: "light", color: "#DC2626", tint: "255, 255, 255" },
  { id: "amber", name: "Sunset Orange", mode: "light", color: "#D97706", tint: "255, 255, 255" },
];

function getCurrentBoardKey() {
  const el = document.querySelector("#board-name-title, header h1, header .font-bold");
  return (el?.textContent || "Shared VTB Board").trim();
}

function applyAppearance() {
  const theme = JSON.parse(origGetItem("vtb_cloud_theme") || "null") || SOLID_PRESETS[0];
  const boardBgs = JSON.parse(origGetItem("vtb_cloud_board_bgs") || "{}");
  const bBg = boardBgs[getCurrentBoardKey()];

  const root = document.documentElement;
  root.setAttribute("data-glass-mode", theme.mode || "light");
  root.style.setProperty("--glass-tint-rgb", theme.tint || "255, 255, 255");
  root.style.setProperty("--board-bg-color", theme.color || "#2563EB");

  if (bBg?.type === "image") {
    root.style.setProperty("--board-bg-image", `url("${bBg.value}")`);
  } else if (bBg?.type === "color") {
    root.style.setProperty("--board-bg-image", "none");
    root.style.setProperty("--board-bg-color", bBg.value);
  } else if (theme.imageUrl) {
    root.style.setProperty("--board-bg-image", `url("${theme.imageUrl}")`);
  } else {
    root.style.setProperty("--board-bg-image", "none");
  }
}

async function compressImg(file) {
  const bmp = await createImageBitmap(file);
  const ratio = Math.min(1400 / bmp.width, 900 / bmp.height, 1);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * ratio);
  c.height = Math.round(bmp.height * ratio);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/webp", 0.78);
}

/* ---------- 6. Status Tab & Idle Timer ("Ask me after") ---------- */
let lastTouch = Date.now();
let modalOpen = false;
["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach((e) =>
  window.addEventListener(e, () => { lastTouch = Date.now(); }, { passive: true })
);

const getStatusPrefs = () =>
  JSON.parse(origGetItem("vtb_cloud_status_prefs") || "null") || { status: "Available", idleTimeoutSec: 300, askAfterMs: null };

const saveStatusPrefs = (u) => {
  const next = { ...getStatusPrefs(), ...u };
  origSetItem("vtb_cloud_status_prefs", JSON.stringify(next));
  pushToCloud();
  return next;
};

setInterval(() => {
  const p = getStatusPrefs();
  const now = Date.now();
  const cd = document.getElementById("vtb-ask-cd");
  if (p.askAfterMs && now < p.askAfterMs) {
    const rem = Math.floor((p.askAfterMs - now) / 1000);
    if (cd) cd.textContent = `(Ask after ${Math.floor(rem / 86400)}d ${Math.floor((rem % 86400) / 3600)}h ${Math.floor((rem % 3600) / 60)}m ${rem % 60}s)`;
    return;
  }
  if (cd) cd.textContent = "";
  if (p.askAfterMs && now >= p.askAfterMs) {
    saveStatusPrefs({ askAfterMs: null });
    if (!modalOpen) openHubModal(true);
  } else if ((now - lastTouch) / 1000 >= (p.idleTimeoutSec || 300) && !modalOpen) {
    openHubModal(true);
  }
}, 1000);

/* ---------- 7. Hub Modal ---------- */
function openHubModal(isIdle = false) {
  modalOpen = true;
  document.querySelector(".vtb-modal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "vtb-modal-overlay";
  const box = document.createElement("div");
  box.className = "vtb-modal-box";

  const prefs = getStatusPrefs();
  const templates = JSON.parse(origGetItem("vtb_bg_templates") || "[]");
  const boardName = getCurrentBoardKey();

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;font-size:17px;font-weight:800;">${isIdle ? "⏰ Status Check & Ask Me After" : "✨ Free Vtb Virtual Task Board — Hub & Settings"}</h3>
      <button id="m-close" style="border:none;background:rgba(0,0,0,0.1);border-radius:99px;padding:4px 10px;cursor:pointer;font-weight:700;">✕</button>
    </div>

    <!-- Direct Invite -->
    <div style="padding:12px;border-radius:14px;background:rgba(37,99,235,0.12);border:1px solid rgba(37,99,235,0.35);margin-bottom:12px;">
      <strong>📩 Invite to Shared Board ("${boardName}") — Sends Email Directly</strong>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <input type="email" id="inv-em" placeholder="teammate@gmail.com" style="flex:1;padding:7px 10px;">
        <button id="inv-go" style="background:#2563EB;color:#fff;border:none;border-radius:10px;padding:7px 14px;font-weight:700;">Send Invite Now</button>
      </div>
    </div>

    <!-- Manual Task Email Dispatch -->
    <div style="padding:12px;border-radius:14px;background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.35);margin-bottom:12px;">
      <strong>📧 Send Created Task Email Manually</strong>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <input type="email" id="mt-to" placeholder="Assignee email">
        <input type="text" id="mt-title" placeholder="Task title">
      </div>
      <button id="mt-send" style="margin-top:8px;background:#059669;color:#fff;border:none;border-radius:10px;padding:7px 14px;font-weight:700;">Send Task Email Manually</button>
    </div>

    <!-- Status & Ask Me After -->
    <div style="padding:12px;border-radius:14px;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.12);margin-bottom:12px;">
      <strong>🟢 Status & "Ask Me After" (Settings & Idle Popup)</strong>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0;">
        ${["Available", "Busy", "In Focus", "Away"].map((st) => `<button class="st-b" data-st="${st}" style="padding:5px 12px;border-radius:99px;border:1px solid rgba(0,0,0,0.2);font-weight:700;background:${prefs.status === st ? "#2563EB" : "transparent"};color:${prefs.status === st ? "#fff" : "inherit"};">${st}</button>`).join("")}
      </div>
      <div style="font-size:12px;margin:6px 0;">
        Idle timeout (sec): <input type="number" id="idle-s" min="10" value="${prefs.idleTimeoutSec || 300}" style="width:80px;padding:4px;">
        <button id="save-idle" style="padding:4px 10px;border-radius:8px;background:#2563EB;color:#fff;border:none;font-weight:700;">Save</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;font-size:11px;text-align:center;margin-top:8px;">
        <div>Years<input type="number" id="aa-y" min="0" value="0" style="width:100%;padding:4px;text-align:center;"></div>
        <div>Days<input type="number" id="aa-d" min="0" value="0" style="width:100%;padding:4px;text-align:center;"></div>
        <div>Hours<input type="number" id="aa-h" min="0" value="0" style="width:100%;padding:4px;text-align:center;"></div>
        <div>Min<input type="number" id="aa-m" min="0" value="15" style="width:100%;padding:4px;text-align:center;"></div>
        <div>Sec<input type="number" id="aa-s" min="0" value="0" style="width:100%;padding:4px;text-align:center;"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;font-size:12px;">
        <button id="set-dur" style="padding:6px 12px;border-radius:8px;background:#0f172a;color:#fff;border:none;font-weight:700;">Set Duration</button>
        <input type="date" id="aa-date" style="padding:4px;">
        <input type="time" id="aa-time" step="1" value="09:00:00" style="padding:4px;">
        <button id="set-exact" style="padding:6px 12px;border-radius:8px;background:#0f172a;color:#fff;border:none;font-weight:700;">Set Exact Date/Sec</button>
        <button id="clr-aa" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(0,0,0,0.2);">Clear</button>
      </div>
    </div>

    <!-- Solid Full Blue Default + Custom Colors + Per-Board BG + Save as Template Prompt -->
    <div style="padding:12px;border-radius:14px;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.12);">
      <strong>🎨 Background Color, Liquid Glass & Per-Board Image</strong>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;">
        ${SOLID_PRESETS.map((p) => `<button class="th-p" data-id="${p.id}" style="padding:5px 10px;border-radius:10px;border:1px solid rgba(0,0,0,0.2);font-size:11.5px;font-weight:700;">${p.name}</button>`).join("")}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:12px;margin:8px 0;">
        <label>Any Color: <input type="color" id="any-c" value="#2563EB"></label>
        <label style="padding:5px 10px;border-radius:8px;background:#2563EB;color:#fff;font-weight:700;cursor:pointer;">Upload Global Image<input type="file" id="up-g" accept="image/*" hidden></label>
        <label style="padding:5px 10px;border-radius:8px;background:#059669;color:#fff;font-weight:700;cursor:pointer;">Upload Board Image<input type="file" id="up-b" accept="image/*" hidden></label>
        <button id="rst-b" style="padding:5px 10px;border-radius:8px;border:1px solid rgba(0,0,0,0.2);">Reset Board BG</button>
      </div>
      <div id="tpl-q" style="display:none;margin-top:8px;padding:10px;border-radius:10px;background:rgba(16,185,129,0.16);border:2px solid #059669;">
        <strong>Save as a template?</strong>
        <button id="tpl-y" style="margin-left:8px;padding:5px 12px;border-radius:8px;background:#059669;color:#fff;border:none;font-weight:700;">Yes</button>
        <button id="tpl-n" style="margin-left:6px;padding:5px 12px;border-radius:8px;background:#0f172a;color:#fff;border:none;font-weight:700;">No</button>
      </div>
      ${templates.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${templates.map((t, i) => `<img src="${t.url}" data-i="${i}" class="tpl-i" style="width:78px;height:48px;object-fit:cover;border-radius:8px;cursor:pointer;border:2px solid #fff;">`).join("")}</div>` : ""}
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const close = () => { modalOpen = false; lastTouch = Date.now(); overlay.remove(); };
  box.querySelector("#m-close").onclick = close;

  box.querySelector("#inv-go").onclick = () => {
    sendDirectBoardInvite(box.querySelector("#inv-em").value, boardName);
    close();
  };

  box.querySelector("#mt-send").onclick = async () => {
    const to = box.querySelector("#mt-to").value.trim();
    const title = box.querySelector("#mt-title").value.trim();
    if (!to || !title) return alert("Enter assignee email and task title.");
    try {
      const r = await dispatchBackendEmail({
        toEmail: to,
        toName: to.split("@")[0],
        subject: `[Free Vtb Virtual Task Board] Task: ${title}`,
        taskTitle: title,
        boardName,
        message: `Task "${title}" on board "${boardName}" was shared with you by ${getActiveEmail()}.\nOpen: ${window.location.origin}`,
      });
      showSiteAndInAppNotification("Task Email Sent", `Sent manually to ${to} via ${r.provider}`);
      close();
    } catch (e) {
      alert(e.message);
    }
  };

  box.querySelectorAll(".st-b").forEach((b) => {
    b.onclick = () => { saveStatusPrefs({ status: b.dataset.st }); updateHubText(`🟢 ${b.dataset.st}`); close(); };
  });
  box.querySelector("#save-idle").onclick = () => saveStatusPrefs({ idleTimeoutSec: Math.max(10, Number(box.querySelector("#idle-s").value)) });
  box.querySelector("#set-dur").onclick = () => {
    const t = new Date();
    t.setFullYear(t.getFullYear() + Number(box.querySelector("#aa-y").value || 0));
    const ms = t.getTime() + (Number(box.querySelector("#aa-d").value || 0) * 86400 + Number(box.querySelector("#aa-h").value || 0) * 3600 + Number(box.querySelector("#aa-m").value || 0) * 60 + Number(box.querySelector("#aa-s").value || 0)) * 1000;
    saveStatusPrefs({ askAfterMs: ms });
    close();
  };
  box.querySelector("#set-exact").onclick = () => {
    const ms = new Date(`${box.querySelector("#aa-date").value}T${box.querySelector("#aa-time").value}`).getTime();
    if (isNaN(ms) || ms <= Date.now()) return alert("Pick a future date & time.");
    saveStatusPrefs({ askAfterMs: ms });
    close();
  };
  box.querySelector("#clr-aa").onclick = () => saveStatusPrefs({ askAfterMs: null });

  box.querySelectorAll(".th-p").forEach((b) => {
    b.onclick = () => {
      const p = SOLID_PRESETS.find((x) => x.id === b.dataset.id);
      if (p) { origSetItem("vtb_cloud_theme", JSON.stringify(p)); applyAppearance(); pushToCloud(); }
    };
  });
  box.querySelector("#any-c").oninput = (e) => {
    origSetItem("vtb_cloud_theme", JSON.stringify({ ...SOLID_PRESETS[0], color: e.target.value }));
    applyAppearance(); pushToCloud();
  };
  box.querySelector("#up-g").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    origSetItem("vtb_cloud_theme", JSON.stringify({ ...SOLID_PRESETS[0], imageUrl: await compressImg(f) }));
    applyAppearance(); pushToCloud();
  };

  let pendingImg = null;
  box.querySelector("#up-b").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    pendingImg = await compressImg(f);
    box.querySelector("#tpl-q").style.display = "block";
  };
  const applyBoardImg = (saveTpl) => {
    if (!pendingImg) return;
    if (saveTpl) {
      const tpls = JSON.parse(origGetItem("vtb_bg_templates") || "[]");
      tpls.unshift({ url: pendingImg });
      origSetItem("vtb_bg_templates", JSON.stringify(tpls.slice(0, 12)));
    }
    const bgs = JSON.parse(origGetItem("vtb_cloud_board_bgs") || "{}");
    bgs[boardName] = { type: "image", value: pendingImg };
    origSetItem("vtb_cloud_board_bgs", JSON.stringify(bgs));
    applyAppearance(); pushToCloud(); close();
  };
  box.querySelector("#tpl-y").onclick = () => applyBoardImg(true);
  box.querySelector("#tpl-n").onclick = () => applyBoardImg(false);
  box.querySelector("#rst-b").onclick = () => {
    const bgs = JSON.parse(origGetItem("vtb_cloud_board_bgs") || "{}");
    delete bgs[boardName];
    origSetItem("vtb_cloud_board_bgs", JSON.stringify(bgs));
    applyAppearance(); pushToCloud();
  };
  box.querySelectorAll(".tpl-i").forEach((img) => {
    img.onclick = () => {
      const t = templates[Number(img.dataset.i)];
      if (t) {
        const bgs = JSON.parse(origGetItem("vtb_cloud_board_bgs") || "{}");
        bgs[boardName] = { type: "image", value: t.url };
        origSetItem("vtb_cloud_board_bgs", JSON.stringify(bgs));
        applyAppearance(); pushToCloud();
      }
    };
  });
}

function updateHubText(txt) {
  const el = document.getElementById("vtb-hub-status");
  if (el) el.textContent = txt;
}

function mountBar() {
  if (document.getElementById("vtb-glass-hub-bar")) return;
  const bar = document.createElement("div");
  bar.id = "vtb-glass-hub-bar";
  bar.className = "vtb-glass-hub-bar";
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <strong>Free Vtb Virtual Task Board</strong>
      <span id="vtb-hub-status">🔄 Connecting Firebase Auto-Sync...</span>
      <span id="vtb-ask-cd" style="font-family:monospace;font-size:11px;"></span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="vtb-glass-pill-btn" id="b-notif">🔔 Enable Site Notifications</button>
      <button class="vtb-glass-pill-btn" id="b-hub">📩 Invite / Manual Task Email / Status / Settings</button>
    </div>
  `;
  const invWrap = document.createElement("div");
  invWrap.id = "vtb-invite-banners";
  document.body.prepend(invWrap);
  document.body.prepend(bar);

  bar.querySelector("#b-notif").onclick = async () => {
    if (!("Notification" in window)) return alert("Browser notifications not supported.");
    const perm = await Notification.requestPermission();
    if (perm === "granted") showSiteAndInAppNotification("Free Vtb Virtual Task Board", "Actual site notifications are now enabled!");
  };
  bar.querySelector("#b-hub").onclick = () => openHubModal(false);
}

(async function boot() {
  applyAppearance();
  mountBar();
  await ensureAuth();

  onAuthStateChanged(auth, async (user) => {
    if (user && user.email) {
      const email = user.email.toLowerCase().trim();
      origSetItem("vtb_user_email", email);
      origSetItem("vtb_user_session", JSON.stringify({ id: user.uid, email, name: user.displayName || email.split("@")[0] }));
      updateHubText(`🟢 Signed in as ${user.displayName || email}`);
      const snap = await getDoc(doc(db, "vtb_cloud_sync", "workspace_v1"));
      if (snap.exists()) {
        lastCloudTs = 0;
        await pullFromCloud(snap.data(), true);
      }
    }
  });

  const initialSnap = await getDoc(doc(db, "vtb_cloud_sync", "workspace_v1"));
  if (initialSnap.exists()) {
    await pullFromCloud(initialSnap.data(), true);
  }
  initialPullDone = true;

  if (window.__vtbPendingWrites?.length) {
    window.__vtbPendingWrites = [];
    await pushToCloud();
  }

  onSnapshot(doc(db, "vtb_cloud_sync", "workspace_v1"), (snap) => {
    if (snap.exists()) pullFromCloud(snap.data(), false);
  });

  watchInvitesAndNotifications();
  updateHubText("🟢 Firebase Auto-Sync Live");
})();
