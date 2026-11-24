import {
  collection, doc, setDoc, addDoc, getDocs, getDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";

export const THEME_PRESETS = [
  { id: "apple-liquid-standard", name: "Apple Liquid Glass (Standard)", mode: "light", tintRgb: "255, 255, 255", opacity: 0.16, blur: 28, accent: "#1d1d1f", appBg: "linear-gradient(135deg, #e8eaed 0%, #f5f5f7 45%, #d9dce0 100%)" },
  { id: "obsidian-glass", name: "Obsidian Smoke Glass", mode: "dark", tintRgb: "38, 38, 42", opacity: 0.42, blur: 28, accent: "#f5f5f7", appBg: "linear-gradient(135deg, #141416 0%, #242428 50%, #0f0f11 100%)" },
  { id: "champagne-sand", name: "Champagne Sand", mode: "light", tintRgb: "255, 248, 236", opacity: 0.24, blur: 26, accent: "#5c4938", appBg: "linear-gradient(135deg, #f3e9dc 0%, #e6d5c3 100%)" },
  { id: "mint-frost", name: "Emerald Mint Frost", mode: "light", tintRgb: "236, 253, 245", opacity: 0.22, blur: 26, accent: "#065f46", appBg: "linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)" },
  { id: "rose-quartz", name: "Rose Quartz Glass", mode: "light", tintRgb: "255, 241, 242", opacity: 0.24, blur: 26, accent: "#881337", appBg: "linear-gradient(135deg, #ffe4e6 0%, #fff1f2 100%)" },
  { id: "lavender-mist", name: "Lavender Mist", mode: "light", tintRgb: "245, 243, 255", opacity: 0.24, blur: 26, accent: "#4c1d95", appBg: "linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)" },
  { id: "sunset-amber", name: "Sunset Amber", mode: "light", tintRgb: "255, 247, 237", opacity: 0.24, blur: 26, accent: "#9a3412", appBg: "linear-gradient(135deg, #fed7aa 0%, #ffedd5 100%)" },
  { id: "ocean-teal", name: "Ocean Teal", mode: "light", tintRgb: "240, 253, 250", opacity: 0.22, blur: 26, accent: "#115e59", appBg: "linear-gradient(135deg, #ccfbf1 0%, #f0fdfa 100%)" },
  { id: "royal-indigo", name: "Royal Indigo", mode: "dark", tintRgb: "30, 27, 75", opacity: 0.45, blur: 28, accent: "#e0e7ff", appBg: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)" },
];

export function hexToRgbString(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

// Apply global theme + per-board background to CSS variables
export function applyAppearanceToDOM(theme, boardBackground) {
  const root = document.documentElement;
  root.setAttribute("data-glass-mode", theme?.mode || "light");
  root.style.setProperty("--glass-tint-rgb", theme?.tintRgb || "255, 255, 255");
  root.style.setProperty("--glass-opacity", String(theme?.opacity ?? 0.16));
  root.style.setProperty("--glass-blur", `${theme?.blur ?? 28}px`);
  root.style.setProperty("--accent-color", theme?.accent || "#1d1d1f");
  root.style.setProperty("--app-bg", theme?.appBg || THEME_PRESETS[0].appBg);

  if (boardBackground?.type === "image" && boardBackground.value) {
    root.style.setProperty("--board-bg-image", `url("${boardBackground.value}")`);
    root.style.setProperty("--board-bg-color", "transparent");
  } else if (boardBackground?.type === "color" && boardBackground.value) {
    root.style.setProperty("--board-bg-image", "none");
    root.style.setProperty("--board-bg-color", boardBackground.value);
    root.style.setProperty("--app-bg", boardBackground.value);
  } else {
    root.style.setProperty("--board-bg-image", "none");
    root.style.setProperty("--board-bg-color", "transparent");
  }
}

// Compress uploaded image safely so it saves cleanly in Firestore across devices
export async function compressImageToDataUrl(file, maxW = 1600, maxH = 1000, quality = 0.8) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", quality);
}

export async function saveGlobalAppearance(theme) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db, "users", uid, "settings", "appearance"), theme, { merge: true });
}

export async function loadGlobalAppearance() {
  const uid = auth.currentUser?.uid;
  if (!uid) return THEME_PRESETS[0];
  const snap = await getDoc(doc(db, "users", uid, "settings", "appearance"));
  return snap.exists() ? snap.data() : THEME_PRESETS[0];
}

export async function saveBoardBackground(boardId, backgroundObj) {
  await updateDoc(doc(db, "boards", boardId), { background: backgroundObj });
}

export async function saveBackgroundTemplate(name, imageDataUrl) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to save templates.");
  const ref = await addDoc(collection(db, "users", uid, "templates"), {
    name,
    imageUrl: imageDataUrl,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, name, imageUrl: imageDataUrl };
}

export async function loadBackgroundTemplates() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(collection(db, "users", uid, "templates"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteBackgroundTemplate(templateId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, "users", uid, "templates", templateId));
}
