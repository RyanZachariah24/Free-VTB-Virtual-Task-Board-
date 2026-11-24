import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "./firebase";

const DEFAULT_STATUS_PREFS = {
  status: "Available",
  idleTimeoutSeconds: 300, // 5 minutes untouched by default
  askMeAfterTimestamp: null, // Epoch ms when prompt may appear again
};

export function useIdleStatusTimer(userId) {
  const [prefs, setPrefs] = useState(DEFAULT_STATUS_PREFS);
  const [showIdlePrompt, setShowIdlePrompt] = useState(false);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [countdownText, setCountdownText] = useState("");

  // Load persisted status & "Ask me after" settings from Firestore
  useEffect(() => {
    if (!userId) return;
    getDoc(doc(db, "users", userId, "settings", "status")).then((snap) => {
      if (snap.exists()) setPrefs({ ...DEFAULT_STATUS_PREFS, ...snap.data() });
    });
  }, [userId]);

  const savePrefs = useCallback(async (updates) => {
    const next = { ...prefs, ...updates };
    setPrefs(next);
    const uid = auth.currentUser?.uid;
    if (uid) {
      await setDoc(doc(db, "users", uid, "settings", "status"), next, { merge: true });
    }
  }, [prefs]);

  // Track user touch/mouse/keyboard activity
  useEffect(() => {
    const resetActivity = () => setLastActivity(Date.now());
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, resetActivity));
  }, []);

  // Safe 1-second check (avoids 24.8-day setTimeout overflow for years/months)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const { askMeAfterTimestamp, idleTimeoutSeconds } = prefs;

      if (askMeAfterTimestamp && now < askMeAfterTimestamp) {
        const diff = Math.max(0, Math.floor((askMeAfterTimestamp - now) / 1000));
        const d = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setCountdownText(`${d}d ${h}h ${m}m ${s}s`);
        return; // Snoozed until exact target timestamp
      }

      setCountdownText("");

      // If "Ask me after" time arrived OR site untouched >= idleTimeoutSeconds
      const idleElapsedSec = (now - lastActivity) / 1000;
      if (askMeAfterTimestamp && now >= askMeAfterTimestamp) {
        setShowIdlePrompt(true);
        // Clear expired askMeAfterTimestamp so it doesn't loop forever
        savePrefs({ askMeAfterTimestamp: null });
      } else if (idleElapsedSec >= (idleTimeoutSeconds || 300) && !showIdlePrompt) {
        setShowIdlePrompt(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [prefs, lastActivity, showIdlePrompt, savePrefs]);

  return {
    prefs,
    savePrefs,
    showIdlePrompt,
    setShowIdlePrompt,
    countdownText,
    acknowledgeActivity: () => {
      setLastActivity(Date.now());
      setShowIdlePrompt(false);
    },
  };
}
