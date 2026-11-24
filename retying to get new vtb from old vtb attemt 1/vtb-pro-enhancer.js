// /vtb-pro-enhancer.js — VTB Unified Settings, Per-Board Themes, Sleep Ask-In & Account Board Hub
(() => {
  'use strict';

  const LS_PREFIX = 'vtb_pro_v8_';
  let accountId = localStorage.getItem(LS_PREFIX + 'last_uid') || 'guest';
  let accountEmail = localStorage.getItem(LS_PREFIX + 'last_email') || '';
  let accountName = localStorage.getItem(LS_PREFIX + 'last_name') || 'Workspace User';
  let fbDb = null;
  let fbMod = null;
  let sleepAskInUntil = Number(localStorage.getItem(LS_PREFIX + 'ask_in_until') || 0);
  let lastActivityAt = Date.now();
  let focusInterval = null;
  let focusSecondsLeft = 0;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  function getContrastText(hex) {
    if (!hex || !hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return '#0f172a';
    const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(full.slice(1, 3), 16) / 255;
    const g = parseInt(full.slice(3, 5), 16) / 255;
    const b = parseInt(full.slice(5, 7), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.56 ? '#0f172a' : '#ffffff';
  }

  function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return hex || `rgba(255,255,255,${alpha})`;
    const f = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    return `rgba(${parseInt(f.slice(1, 3), 16)},${parseInt(f.slice(3, 5), 16)},${parseInt(f.slice(5, 7), 16)},${alpha})`;
  }

  /* ---------- Standard Presets ---------- */
  const STANDARD_THEMES = [
    { id: 'solid-blue', name: 'Classic Solid Blue', bg: '#2563EB', header: '#ffffff', lane: '#ffffff', card: '#ffffff', primary: '#2563EB', btn: '#f1f5f9', accent: '#2563EB' },
    { id: 'clean-light', name: 'Clean Light Studio', bg: '#E2E8F0', header: '#ffffff', lane: '#f8fafc', card: '#ffffff', primary: '#2563EB', btn: '#e2e8f0', accent: '#0ea5e9' },
    { id: 'midnight', name: 'Midnight Dark', bg: '#0F172A', header: '#1E293B', lane: '#1E293B', card: '#334155', primary: '#3B82F6', btn: '#334155', accent: '#38BDF8' },
    { id: 'emerald', name: 'Emerald Forest', bg: '#047857', header: '#ecfdf5', lane: '#ffffff', card: '#ffffff', primary: '#059669', btn: '#d1fae5', accent: '#10B981' },
    { id: 'indigo', name: 'Royal Indigo', bg: '#4338CA', header: '#eef2ff', lane: '#ffffff', card: '#ffffff', primary: '#4F46E5', btn: '#e0e7ff', accent: '#6366F1' },
    { id: 'sunset', name: 'Sunset Rose', bg: '#BE123C', header: '#fff1f2', lane: '#ffffff', card: '#ffffff', primary: '#E11D48', btn: '#ffe4e6', accent: '#F43F5E' },
    { id: 'sand', name: 'Warm Sand', bg: '#FEF3C7', header: '#ffffff', lane: '#fffbeb', card: '#ffffff', primary: '#D97706', btn: '#fde68a', accent: '#D97706' }
  ];

  const STANDARD_GRADIENTS = [
    { name: 'None (Solid Color)', css: 'none' },
    { name: 'Ocean Breeze', css: 'linear-gradient(135deg,#1d4ed8,#0284c7,#06b6d4)' },
    { name: 'Aurora Violet', css: 'linear-gradient(135deg,#312e81,#6d28d9,#db2777)' },
    { name: 'Forest Mist', css: 'linear-gradient(135deg,#064e3b,#047857,#0d9488)' },
    { name: 'Warm Sunset', css: 'linear-gradient(135deg,#9a3412,#ea580c,#f59e0b)' },
    { name: 'Carbon Night', css: 'linear-gradient(135deg,#020617,#0f172a,#1e293b)' }
  ];

  const STANDARD_STATUSES = [
    { id: 'available', label: 'Available', emoji: '🟢', bg: '#dcfce7', fg: '#166534' },
    { id: 'away', label: 'Away', emoji: '⏳', bg: '#fef3c7', fg: '#92400e' },
    { id: 'busy', label: 'Busy', emoji: '🔴', bg: '#fee2e2', fg: '#991b1b' },
    { id: 'call', label: 'In a Call', emoji: '📞', bg: '#dbeafe', fg: '#1e40af' },
    { id: 'focus', label: 'Deep Focus', emoji: '🎯', bg: '#ede9fe', fg: '#5b21b6' },
    { id: 'ooo', label: 'Out of Office', emoji: '✈️', bg: '#e2e8f0', fg: '#334155' }
  ];

  const STANDARD_TEMPLATES = [
    { id: 'tpl-sprint', name: 'Sprint Launch', desc: 'Backlog → In Progress → Review → Done', themeId: 'solid-blue', lanes: ['Backlog', 'In Progress', 'Review', 'Done'] },
    { id: 'tpl-personal', name: 'Personal Daily Focus', desc: 'Today → Doing → Waiting → Completed', themeId: 'emerald', lanes: ['Today', 'Doing', 'Waiting', 'Completed'] },
    { id: 'tpl-bugs', name: 'Bug Triage Tracker', desc: 'Reported → Investigating → Fixing → Verified', themeId: 'sunset', lanes: ['Reported', 'Investigating', 'Fixing', 'Verified'] },
    { id: 'tpl-content', name: 'Content Studio Pipeline', desc: 'Ideas → Scripting → Editing → Published', themeId: 'indigo', lanes: ['Ideas', 'Scripting', 'Editing', 'Published'] }
  ];

  const EMAIL_TEMPLATES = {
    assign: { subject: 'New Task Assigned: {{title}}', body: 'Hi,\n\nYou have been assigned the task "{{title}}" in lane "{{lane}}" (Priority: {{priority}}, Due: {{due}}).\n\nOpen board: https://freevtbvirtualtaskboard.vercel.app/' },
    reminder: { subject: 'Reminder: {{title}} is due soon', body: 'Hi,\n\nFriendly reminder that "{{title}}" in "{{lane}}" is due on {{due}}.\n\nBoard: https://freevtbvirtualtaskboard.vercel.app/' },
    overdue: { subject: 'Overdue Alert: {{title}}', body: 'Hi,\n\nThe task "{{title}}" ({{priority}}) is now overdue. Please update its status on VTB.\n\nBoard: https://freevtbvirtualtaskboard.vercel.app/' },
    update: { subject: 'Board Update: {{title}}', body: 'Hi team,\n\nQuick update on "{{title}}" in lane "{{lane}}".\n\nView board: https://freevtbvirtualtaskboard.vercel.app/' }
  };

  /* ---------- Account-Scoped Local + Cloud Persistence ---------- */
  const defaultStore = () => ({
    status: { ...STANDARD_STATUSES[0], customIcon: '' },
    askInMinutes: 15,
    autoContrast: true,
    boardThemes: {},
    templates: [],
    invites: [],
    emailLog: [],
    uploads: [],
    vtbSaved: [],
    integrations: {
      geminiApiKey: '',
      geminiModel: 'gemini-2.5-flash',
      discordWebhook: '',
      slackWebhook: '',
      genericWebhook: '',
      autoNotifyOnDone: true,
      autoNotifyOnP1: true
    }
  });

  /* ---------- Integration Helpers: Calendar (.ics), CSV Export & Webhooks ---------- */
  function exportBoardToIcs(board) {
    const cards = Array.isArray(board?.cards) ? board.cards : [];
    const lanes = Array.isArray(board?.lanes) ? board.lanes : [];
    const laneMap = Object.fromEntries(lanes.map((l) => [l.id, l.name]));

    const formatIcsDate = (d) => {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return null;
      return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Visual Task Boards//VTB Pro Calendar//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${(board.name || 'Kanban').replace(/[,;]/g, '')}`,
      'X-WR-TIMEZONE:UTC'
    ];

    cards.forEach((c) => {
      if (!c.due) return;
      const dueIso = c.due.includes('T') ? c.due : `${c.due}T17:00:00Z`;
      const dtEnd = formatIcsDate(dueIso);
      if (!dtEnd) return;
      const dtStart = formatIcsDate(new Date(new Date(dueIso).getTime() - 3600000));
      const laneName = laneMap[c.laneId] || 'Task';
      const summary = `[${laneName}] ${c.title || 'Task'}`;
      const desc = (c.description || c.title || '').replace(/\n/g, '\\n');

      ics.push(
        'BEGIN:VEVENT',
        `UID:vtb_${c.id || Math.random().toString(36).slice(2)}@vtb.app`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${dtStart || dtEnd}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${desc}`,
        `PRIORITY:${c.priority === 1 ? 1 : c.priority === 2 ? 3 : 5}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Task Due in 1 hour',
        'END:VALARM',
        'END:VEVENT'
      );
    });

    ics.push('END:VCALENDAR');
    const blob = new Blob([ics.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(board.name || 'vtb-board').toLowerCase().replace(/\s+/g, '-')}-calendar.ics`;
    a.click();
    showToast('📅 Calendar exported! Double-click .ics file to add to Apple/Google Calendar.');
  }

  function exportBoardToCsv(board) {
    const cards = Array.isArray(board?.cards) ? board.cards : [];
    const lanes = Array.isArray(board?.lanes) ? board.lanes : [];
    const laneMap = Object.fromEntries(lanes.map((l) => [l.id, l.name]));
    const memberMap = Object.fromEntries((board?.members || []).map((m) => [m.id, m.name]));

    const headers = ['Task ID', 'Title', 'Description', 'Lane', 'Priority', 'Assignee', 'Due Date', 'Labels'];
    const rows = cards.map((c) => [
      c.id,
      `"${(c.title || '').replace(/"/g, '""')}"`,
      `"${(c.description || '').replace(/"/g, '""')}"`,
      `"${laneMap[c.laneId] || ''}"`,
      c.priority ? `P${c.priority}` : '',
      `"${memberMap[c.assigneeId] || c.assigneeId || ''}"`,
      c.due || '',
      `"${(c.labels || []).join(', ')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(board.name || 'vtb-board').toLowerCase().replace(/\s+/g, '-')}-tasks.csv`;
    a.click();
    showToast(`📊 Exported ${cards.length} tasks to CSV!`);
  }

  async function sendWebhookNotification(type, taskTitle, boardName, details = '') {
    const it = store.integrations || {};
    const payloadText = `📌 **VTB Alert** [${boardName}]: ${type} — "${taskTitle}" ${details ? `(${details})` : ''}`;

    if (it.discordWebhook) {
      try {
        await fetch(it.discordWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: payloadText, username: 'VTB Kanban' })
        });
      } catch (e) { console.warn('Discord webhook error:', e); }
    }
    if (it.slackWebhook) {
      try {
        await fetch(it.slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: payloadText })
        });
      } catch (e) { console.warn('Slack webhook error:', e); }
    }
    if (it.genericWebhook) {
      try {
        await fetch(it.genericWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, taskTitle, boardName, details, timestamp: Date.now() })
        });
      } catch (e) { console.warn('Generic webhook error:', e); }
    }
  }

  function storeKey(uidVal = accountId) { return `${LS_PREFIX}store_${uidVal}`; }

  function loadStore() {
    try {
      const raw = localStorage.getItem(storeKey());
      if (raw) return { ...defaultStore(), ...JSON.parse(raw) };
    } catch {}
    return defaultStore();
  }

  let store = loadStore();

  function saveLocalStore() {
    try {
      (window.__vtbOrigSetItem || localStorage.setItem.bind(localStorage))(storeKey(), JSON.stringify(store));
    } catch (e) { console.warn('[VTB Pro] Local save failed (storage quota?):', e); }
  }

  async function syncPrefsToCloud() {
    saveLocalStore();
    if (!fbDb || !fbMod || accountId === 'guest') return;
    try {
      const { doc, setDoc } = fbMod;
      await setDoc(doc(fbDb, 'users', accountId, 'vtb_preferences', 'main'), {
        status: store.status,
        askInMinutes: store.askInMinutes,
        autoContrast: store.autoContrast,
        boardThemes: store.boardThemes,
        templates: store.templates,
        invites: store.invites.slice(0, 50),
        emailLog: store.emailLog.slice(0, 50),
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) { console.warn('[VTB Pro] Cloud pref sync warning:', err); }
  }

  async function syncUploadDoc(item, remove = false) {
    saveLocalStore();
    if (!fbDb || !fbMod || accountId === 'guest') return;
    try {
      const { doc, setDoc, deleteDoc } = fbMod;
      const ref = doc(fbDb, 'users', accountId, 'vtb_uploads', item.id);
      if (remove) await deleteDoc(ref);
      else await setDoc(ref, item);
    } catch (err) { console.warn('[VTB Pro] Cloud upload sync warning:', err); }
  }

  async function syncSavedVtbDoc(item, remove = false) {
    saveLocalStore();
    if (!fbDb || !fbMod || accountId === 'guest') return;
    try {
      const { doc, setDoc, deleteDoc } = fbMod;
      const ref = doc(fbDb, 'users', accountId, 'vtb_saved', item.id);
      if (remove) await deleteDoc(ref);
      else await setDoc(ref, item);
    } catch (err) { console.warn('[VTB Pro] Cloud VTB save warning:', err); }
  }

  async function hydrateFromCloud(user) {
    accountId = user ? user.uid : 'guest';
    accountEmail = user?.email || '';
    accountName = user?.displayName || user?.email?.split('@')[0] || 'Workspace User';
    localStorage.setItem(LS_PREFIX + 'last_uid', accountId);
    localStorage.setItem(LS_PREFIX + 'last_email', accountEmail);
    localStorage.setItem(LS_PREFIX + 'last_name', accountName);
    store = loadStore();

    if (user && fbDb && fbMod) {
      try {
        const { doc, getDoc, collection, getDocs } = fbMod;
        const prefSnap = await getDoc(doc(fbDb, 'users', accountId, 'vtb_preferences', 'main'));
        if (prefSnap.exists()) {
          const d = prefSnap.data();
          store = { ...store, ...d, uploads: store.uploads, vtbSaved: store.vtbSaved };
        }
        const upSnap = await getDocs(collection(fbDb, 'users', accountId, 'vtb_uploads'));
        if (!upSnap.empty) {
          const map = new Map(store.uploads.map((x) => [x.id, x]));
          upSnap.forEach((ds) => map.set(ds.id, ds.data()));
          store.uploads = Array.from(map.values()).sort((a, b) => (b.at || 0) - (a.at || 0));
        }
        const svSnap = await getDocs(collection(fbDb, 'users', accountId, 'vtb_saved'));
        if (!svSnap.empty) {
          const map = new Map(store.vtbSaved.map((x) => [x.id, x]));
          svSnap.forEach((ds) => map.set(ds.id, ds.data()));
          store.vtbSaved = Array.from(map.values()).sort((a, b) => (b.at || 0) - (a.at || 0));
        }
        saveLocalStore();
      } catch (err) { console.warn('[VTB Pro] Cloud hydrate warning:', err); }
    }
    applyBoardTheme();
    updateSubBarStatus();
  }

  /* ---------- Toast Helper ---------- */
  function showToast(msg) {
    let stack = document.querySelector('.vtb-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'vtb-toast-stack';
      document.body.appendChild(stack);
    }
    const item = document.createElement('div');
    item.className = 'vtb-toast-item';
    item.textContent = msg;
    stack.appendChild(item);
    setTimeout(() => item.remove(), 3800);
  }

  /**
   * Fix button text colors inside light-background containers
   * (modals, inject panels) so the glass CSS doesn't override them.
   * Reads existing inline color values and applies them with !important.
   */
  function fixButtonColors(container) {
    if (!container) return;
    container.querySelectorAll('button').forEach((btn) => {
      const style = btn.getAttribute('style') || '';
      // Extract inline color if present
      const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
      if (colorMatch) {
        btn.style.setProperty('color', colorMatch[1].trim(), 'important');
      } else {
        // Determine readable color from background
        const bgMatch = style.match(/background(?:-color)?\s*:\s*([^;]+)/i);
        const bg = bgMatch ? bgMatch[1].trim().toLowerCase() : '';
        const darkBg = bg && (
          bg.includes('#2563') || bg.includes('2563eb') ||
          bg.includes('#0f17') || bg.includes('0f172a') ||
          bg.includes('#0591') || bg.includes('059669') ||
          bg.includes('#b453') || bg.includes('b45309') ||
          bg.includes('#1d4') || bg.includes('linear-gradient') ||
          bg.includes('#1e40') || bg.includes('#b91c')
        );
        btn.style.setProperty('color', darkBg ? '#ffffff' : '#0f172a', 'important');
      }
      // Always remove text-shadow inside panels (glass adds it via CSS)
      btn.style.setProperty('text-shadow', 'none', 'important');
    });
  }

  /* ---------- Per-Board Detection & Component Theme Application ---------- */
  function getCurrentBoardInfo() {
    const titleEl =
      document.getElementById('board-name-title') ||
      document.querySelector('header h1, header h2, [data-board-name], main h1');
    const rawName = (titleEl?.textContent || '').trim() || 'Main Workspace Board';
    const cleanName = rawName.replace(/\s+/g, ' ').slice(0, 60);
    const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default-board';
    return { id, name: cleanName };
  }

  function getBoardTheme(boardId = getCurrentBoardInfo().id) {
    const saved = store.boardThemes[boardId] || store.boardThemes['__default__'];
    const base = STANDARD_THEMES[0];
    return {
      bg: base.bg, bgImage: 'none', bgOverlay: 0,
      header: base.header, lane: base.lane, card: base.card,
      primary: base.primary, btn: base.btn, accent: base.accent,
      ...saved
    };
  }

  function applyBoardTheme() {
    const info = getCurrentBoardInfo();
    const t = getBoardTheme(info.id);
    const root = document.documentElement;
    root.style.setProperty('--vtb-bg', t.bg);
    root.style.setProperty('--vtb-bg-image', t.bgImage || 'none');
    root.style.setProperty('--vtb-bg-overlay', `rgba(15, 23, 42, ${Number(t.bgOverlay || 0)})`);
    root.style.setProperty('--vtb-header-bg', hexToRgba(t.header, 0.90));
    root.style.setProperty('--vtb-header-fg', getContrastText(t.header));
    root.style.setProperty('--vtb-lane-bg', hexToRgba(t.lane, 0.84));
    root.style.setProperty('--vtb-lane-border', getContrastText(t.lane) === '#ffffff' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.74)');
    root.style.setProperty('--vtb-card-bg', hexToRgba(t.card, 0.96));
    root.style.setProperty('--vtb-card-fg', getContrastText(t.card));
    root.style.setProperty('--vtb-primary-bg', t.primary);
    root.style.setProperty('--vtb-primary-fg', getContrastText(t.primary));
    root.style.setProperty('--vtb-btn-bg', t.btn);
    root.style.setProperty('--vtb-btn-fg', getContrastText(t.btn));
    root.style.setProperty('--vtb-accent', t.accent);
    root.setAttribute('data-vtb-custom-btn', t.primary !== '#2563EB' ? '1' : '0');
  }

  /* ---------- Image Compression Helper for Fast Uploads & Wallpapers ---------- */
  function readFileSmart(file) {
    return new Promise((resolve, reject) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => resolve({ dataUrl: reader.result, isImage: true });
          img.onload = () => {
            const maxDim = 1400;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              const scale = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * scale);
              height = Math.round(height * scale);
            }
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            c.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve({ dataUrl: c.toDataURL('image/jpeg', 0.82), isImage: true });
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      } else {
        if (file.size > 750 * 1024) {
          reject(new Error('Non-image files must be under 750 KB for cloud account sync.'));
          return;
        }
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve({ dataUrl: reader.result, isImage: false });
        reader.readAsDataURL(file);
      }
    });
  }

  /* ---------- 1. Remove "🟢 Firebase Auto-Sync Live" Text ---------- */
  function stripFirebaseAutoSyncText() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (/firebase\s*auto-?sync\s*live/i.test(walker.currentNode.nodeValue || '')) {
        nodes.push(walker.currentNode);
      }
    }
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (parent && parent.childNodes.length === 1 && /^\s*🟢?\s*firebase\s*auto-?sync\s*live\s*$/i.test(parent.textContent || '')) {
        parent.style.display = 'none';
      } else {
        node.nodeValue = (node.nodeValue || '').replace(/🟢?\s*Firebase\s*Auto-?Sync\s*Live\s*[•·|]?/gi, '').trim();
      }
    });
  }

  /* ---------- Comprehensive Ask-In Timer & Exact Time Picker ---------- */
  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatTimeRemaining(targetMs) {
    const diff = targetMs - Date.now();
    if (diff <= 0) return 'Immediate (now)';
    const totalSec = Math.floor(diff / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0 || d > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return 'in ' + parts.join(' ');
  }

  function formatTargetDateTime(targetMs) {
    const d = new Date(targetMs);
    return d.toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }

  function isSnoozed() {
    const until = Number(localStorage.getItem(LS_PREFIX + 'ask_in_until') || sleepAskInUntil || 0);
    return until > 0 && Date.now() < until;
  }
  window.__vtbIsSnoozed = isSnoozed;

  function getSnoozeUntil() {
    return Number(localStorage.getItem(LS_PREFIX + 'ask_in_until') || sleepAskInUntil || 0);
  }

  function setSnoozeUntil(targetMs, desc) {
    sleepAskInUntil = targetMs;
    localStorage.setItem(LS_PREFIX + 'ask_in_until', String(targetMs));
    syncPrefsToCloud();
    showToast(`⏰ Snoozed! Next prompt: ${formatTargetDateTime(targetMs)} (${desc || formatTimeRemaining(targetMs)})`);
  }

  function clearSnooze() {
    sleepAskInUntil = 0;
    localStorage.removeItem(LS_PREFIX + 'ask_in_until');
    syncPrefsToCloud();
    showToast('⏰ Snooze cleared! Normal sleep / idle checks active.');
  }

  function buildAskInPicker(defaultMinutes = 15, onApply) {
    const box = document.createElement('div');
    box.className = 'vtb-sleep-inject';

    let currentMode = 'presets'; // 'presets' | 'duration' | 'exact'
    let targetMs = Date.now() + defaultMinutes * 60000;

    const PRESETS = [
      { label: '5m', mins: 5 },
      { label: '15m', mins: 15 },
      { label: '30m', mins: 30 },
      { label: '1h', mins: 60 },
      { label: '2h', mins: 120 },
      { label: '4h', mins: 240 },
      { label: '8h', mins: 480 },
      { label: '1 day', mins: 1440 }
    ];

    const currentUntil = getSnoozeUntil();
    const isCurrentlySnoozed = currentUntil > Date.now();

    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">⏰</span>
          <strong style="font-size:13px;color:#0f172a;letter-spacing:-0.01em;">Set "Ask In" Timer (Snooze Sleep Prompt)</strong>
        </div>
        <div style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:${isCurrentlySnoozed ? '#dcfce7' : '#e2e8f0'};color:${isCurrentlySnoozed ? '#166534' : '#475569'};">
          ${isCurrentlySnoozed ? `Active: ${formatTimeRemaining(currentUntil)}` : 'No active snooze'}
        </div>
      </div>

      <!-- Mode selection tabs -->
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <button type="button" class="vtb-snooze-tab active" data-mode="presets">⏱️ Quick Presets</button>
        <button type="button" class="vtb-snooze-tab" data-mode="duration">⏳ Days / Hours / Mins / Secs</button>
        <button type="button" class="vtb-snooze-tab" data-mode="exact">📅 Choose Exact Date & Time</button>
      </div>

      <!-- Tab 1: Presets -->
      <div id="vtb-panel-presets" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        ${PRESETS.map((p) => `<button type="button" class="vtb-preset-btn ${p.mins === defaultMinutes ? 'active' : ''}" data-mins="${p.mins}">${p.label}</button>`).join('')}
      </div>

      <!-- Tab 2: Custom Duration -->
      <div id="vtb-panel-duration" style="display:none;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">
        <div style="display:flex;flex-direction:column;gap:3px;text-align:center;">
          <span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;">Days</span>
          <input type="number" min="0" max="365" value="0" id="vtb-inp-days" style="height:32px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;text-align:center;">
          <span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;">Hours</span>
          <input type="number" min="0" max="23" value="0" id="vtb-inp-hours" style="height:32px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;text-align:center;">
          <span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;">Minutes</span>
          <input type="number" min="0" max="59" value="${defaultMinutes}" id="vtb-inp-mins" style="height:32px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;text-align:center;">
          <span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;">Seconds</span>
          <input type="number" min="0" max="59" value="0" id="vtb-inp-secs" style="height:32px;border-color:#2563EB!important;color:#2563EB!important;">
        </div>
      </div>

      <!-- Tab 3: Exact Date & Time -->
      <div id="vtb-panel-exact" style="display:none;grid-template-columns:1.2fr 1.4fr;gap:8px;margin-bottom:10px;">
        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;">Target Date</span>
          <input type="date" id="vtb-inp-date" style="height:32px;font-size:12px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;">Time (H : M : S)</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <input type="number" min="0" max="23" id="vtb-inp-exact-h" style="width:48px;height:32px;"> :
            <input type="number" min="0" max="59" id="vtb-inp-exact-m" style="width:48px;height:32px;"> :
            <input type="number" min="0" max="59" id="vtb-inp-exact-s" style="width:48px;height:32px;border-color:#2563EB!important;color:#2563EB!important;">
          </div>
        </div>
      </div>

      <!-- Live preview of target date & time -->
      <div id="vtb-ask-preview" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:10px;background:#ffffff;border:1px solid #e2e8f0;font-size:11.5px;margin-bottom:10px;flex-wrap:wrap;gap:4px;">
        <span style="color:#475569;">Will ask again: <strong id="vtb-preview-datetime" style="color:#0f172a;"></strong></span>
        <span id="vtb-preview-countdown" style="font-family:'JetBrains Mono',monospace;font-weight:800;color:#2563EB;"></span>
      </div>

      <!-- Actions -->
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        ${isCurrentlySnoozed ? '<button type="button" id="vtb-btn-cancel-snooze" style="padding:7px 12px;border-radius:99px;border:1px solid #cbd5e1;background:#fff;color:#b91c1c;font-weight:700;font-size:11.5px;">Clear Snooze</button>' : '<span style="font-size:11px;color:#64748b;">Sleep prompt will only appear after this set time.</span>'}
        <button type="button" class="vtb-btn-set-ask" id="vtb-btn-apply-ask" style="margin-left:auto;">⏰ Set "Ask In" & Snooze</button>
      </div>
    `;

    // Elements
    const pnlPresets = box.querySelector('#vtb-panel-presets');
    const pnlDuration = box.querySelector('#vtb-panel-duration');
    const pnlExact = box.querySelector('#vtb-panel-exact');
    const previewDate = box.querySelector('#vtb-preview-datetime');
    const previewCount = box.querySelector('#vtb-preview-countdown');

    const inpDays = box.querySelector('#vtb-inp-days');
    const inpHours = box.querySelector('#vtb-inp-hours');
    const inpMins = box.querySelector('#vtb-inp-mins');
    const inpSecs = box.querySelector('#vtb-inp-secs');

    const inpDate = box.querySelector('#vtb-inp-date');
    const inpExactH = box.querySelector('#vtb-inp-exact-h');
    const inpExactM = box.querySelector('#vtb-inp-exact-m');
    const inpExactS = box.querySelector('#vtb-inp-exact-s');

    // Populate initial inputs from targetMs
    const syncInputsFromTarget = () => {
      const d = new Date(targetMs);
      const diffSec = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      inpDays.value = Math.floor(diffSec / 86400);
      inpHours.value = Math.floor((diffSec % 86400) / 3600);
      inpMins.value = Math.floor((diffSec % 3600) / 60);
      inpSecs.value = diffSec % 60;

      const ymdStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      inpDate.value = ymdStr;
      inpExactH.value = pad2(d.getHours());
      inpExactM.value = pad2(d.getMinutes());
      inpExactS.value = pad2(d.getSeconds());

      previewDate.textContent = formatTargetDateTime(targetMs);
      previewCount.textContent = formatTimeRemaining(targetMs);
    };

    syncInputsFromTarget();

    // Mode Switching
    box.querySelectorAll('.vtb-snooze-tab').forEach((tabBtn) => {
      tabBtn.onclick = () => {
        box.querySelectorAll('.vtb-snooze-tab').forEach((b) => b.classList.remove('active'));
        tabBtn.classList.add('active');
        currentMode = tabBtn.dataset.mode;
        pnlPresets.style.display = currentMode === 'presets' ? 'flex' : 'none';
        pnlDuration.style.display = currentMode === 'duration' ? 'grid' : 'none';
        pnlExact.style.display = currentMode === 'exact' ? 'grid' : 'none';
      };
    });

    // Preset clicks
    box.querySelectorAll('.vtb-preset-btn').forEach((pBtn) => {
      pBtn.onclick = () => {
        box.querySelectorAll('.vtb-preset-btn').forEach((b) => b.classList.remove('active'));
        pBtn.classList.add('active');
        const mins = Number(pBtn.dataset.mins) || 15;
        targetMs = Date.now() + mins * 60000;
        syncInputsFromTarget();
      };
    });

    // Duration input listener
    const onDurationInput = () => {
      const d = Math.max(0, Number(inpDays.value) || 0);
      const h = Math.max(0, Number(inpHours.value) || 0);
      const m = Math.max(0, Number(inpMins.value) || 0);
      const s = Math.max(0, Number(inpSecs.value) || 0);
      const totalMs = (d * 86400 + h * 3600 + m * 60 + s) * 1000;
      targetMs = Date.now() + Math.max(5000, totalMs);
      const td = new Date(targetMs);
      inpDate.value = `${td.getFullYear()}-${pad2(td.getMonth() + 1)}-${pad2(td.getDate())}`;
      inpExactH.value = pad2(td.getHours());
      inpExactM.value = pad2(td.getMinutes());
      inpExactS.value = pad2(td.getSeconds());
      previewDate.textContent = formatTargetDateTime(targetMs);
      previewCount.textContent = formatTimeRemaining(targetMs);
    };
    [inpDays, inpHours, inpMins, inpSecs].forEach((i) => i.addEventListener('input', onDurationInput));

    // Exact date/time listener
    const onExactInput = () => {
      const dateVal = inpDate.value;
      if (!dateVal) return;
      const [y, mo, day] = dateVal.split('-').map(Number);
      const h = Number(inpExactH.value) || 0;
      const m = Number(inpExactM.value) || 0;
      const s = Number(inpExactS.value) || 0;
      const selected = new Date(y, mo - 1, day, h, m, s).getTime();
      if (!isNaN(selected)) {
        targetMs = Math.max(Date.now() + 5000, selected);
        const diffSec = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
        inpDays.value = Math.floor(diffSec / 86400);
        inpHours.value = Math.floor((diffSec % 86400) / 3600);
        inpMins.value = Math.floor((diffSec % 3600) / 60);
        inpSecs.value = diffSec % 60;
        previewDate.textContent = formatTargetDateTime(targetMs);
        previewCount.textContent = formatTimeRemaining(targetMs);
      }
    };
    [inpDate, inpExactH, inpExactM, inpExactS].forEach((i) => i.addEventListener('input', onExactInput));

    // Apply button
    box.querySelector('#vtb-btn-apply-ask').onclick = () => {
      setSnoozeUntil(targetMs, formatTimeRemaining(targetMs));
      if (typeof onApply === 'function') onApply(targetMs);
    };

    // Cancel button
    const cancelBtn = box.querySelector('#vtb-btn-cancel-snooze');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        clearSnooze();
        if (typeof onApply === 'function') onApply(0);
      };
    }

    fixButtonColors(box);
    return box;
  }

  /* ---------- 2. Enhance "Tab Sleep Mode / Inactive" Modal ---------- */
  function enhanceSleepModeModal() {
    const candidates = document.querySelectorAll('div, section, dialog');
    for (const el of candidates) {
      if (el.dataset.vtbSleepEnhanced) continue;
      if (el.children.length === 0) continue;
      const txt = el.textContent || '';
      if (!txt.includes('Tab Sleep Mode / Inactive') || !txt.includes('Do you want to display your status as away')) continue;
      if (!txt.includes('Dismiss')) continue;
      const innerModal = Array.from(el.querySelectorAll('div')).find(
        (d) => d !== el && (d.textContent || '').includes('Tab Sleep Mode / Inactive') && (d.textContent || '').includes('Dismiss')
      );
      if (innerModal) continue;

      // 1. STRICT SNOOZE CHECK: "the ask me after should ask only after the set time"
      if (isSnoozed()) {
        const dismissBtn = el.querySelector('button[title="Dismiss"]') ||
          Array.from(el.querySelectorAll('button')).find((b) => /^dismiss$/i.test((b.textContent || '').trim()));
        if (dismissBtn) dismissBtn.click();
        else el.style.display = 'none';
        return;
      }

      el.dataset.vtbSleepEnhanced = '1';

      // Fix contrast on buttons
      el.querySelectorAll('button').forEach((btn) => {
        const bt = (btn.textContent || '').trim();
        if (/keep status as available/i.test(bt)) {
          btn.style.setProperty('color', '#0f172a', 'important');
          btn.style.setProperty('background', '#f1f5f9', 'important');
          btn.style.setProperty('border', '1px solid #cbd5e1', 'important');
          btn.style.setProperty('border-radius', '9999px', 'important');
          btn.style.setProperty('padding', '8px 16px', 'important');
          btn.style.setProperty('font-weight', '800', 'important');
        } else if (/^dismiss$/i.test(bt)) {
          btn.style.setProperty('color', '#0f172a', 'important');
          btn.style.setProperty('background', '#ffffff', 'important');
          btn.style.setProperty('border', '1px solid #cbd5e1', 'important');
          btn.style.setProperty('border-radius', '9999px', 'important');
          btn.style.setProperty('padding', '8px 16px', 'important');
          btn.style.setProperty('font-weight', '800', 'important');
        } else if (btn.title === 'Dismiss') {
          btn.style.setProperty('color', '#94a3b8', 'important');
        }
      });

      // Remove any existing quick features or previous injections
      el.querySelectorAll('.vtb-sleep-inject').forEach((n) => n.remove());

      const dismissModal = () => {
        const dismissBtn = Array.from(el.querySelectorAll('button')).find((b) => /^dismiss$/i.test((b.textContent || '').trim())) ||
          el.querySelector('button[title="Dismiss"]');
        if (dismissBtn) dismissBtn.click();
        else el.style.display = 'none';
      };

      // Inject full flexible Ask-In Picker (Presets, D/H/M/S, Exact Date & Time)
      const picker = buildAskInPicker(store.askInMinutes || 15, () => {
        dismissModal();
      });

      const footer = Array.from(el.children).find((c) => (c.textContent || '').includes('Dismiss'));
      if (footer) el.insertBefore(picker, footer);
      else el.appendChild(picker);

      fixButtonColors(el);
    }
  }

  // Active snooze keeper: resets idle timer during active snooze so React doesn't show modal prematurely
  setInterval(() => {
    if (isSnoozed()) {
      window.dispatchEvent(new Event('mousemove'));
    }
  }, 25000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isSnoozed()) {
      window.dispatchEvent(new Event('mousemove'));
    }
  });

  /* ---------- 3. Settings Sub-Bar with Dropdown & Quick Launch ---------- */
  function updateSubBarStatus() {
    const pill = document.getElementById('vtb-sub-status-pill');
    if (!pill) return;
    const st = store.status || STANDARD_STATUSES[0];
    pill.style.background = st.bg || '#dcfce7';
    pill.style.color = st.fg || getContrastText(st.bg || '#dcfce7');
    pill.innerHTML = `${st.customIcon ? `<img src="${esc(st.customIcon)}" style="width:14px;height:14px;border-radius:99px;object-fit:cover;">` : esc(st.emoji || '🟢')} ${esc(st.label || 'Available')}`;
  }

  function mountSettingsSubBar() {
    let bar = document.getElementById('vtb-settings-subbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'vtb-settings-subbar';
      bar.innerHTML = `
        <div style="position:relative;display:inline-block;" id="vtb-settings-menu-wrapper">
          <button type="button" class="vtb-sub-btn vtb-sub-settings-trigger" id="vtb-sub-settings-trigger">
            <span>⚙️ Settings</span>
            <span id="vtb-settings-caret" style="font-size:9px;margin-left:2px;transition:transform .2s;">▼</span>
          </button>
          <div id="vtb-settings-dropdown" style="display:none;">
            <div style="padding:6px 10px 8px;border-bottom:1px solid #f1f5f9;margin-bottom:4px;">
              <div style="font-weight:800;font-size:11px;color:#0f172a;letter-spacing:0.04em;">SETTINGS & QUICK LAUNCH</div>
              <div style="font-size:10.5px;color:#64748b;">Click any feature to open tool</div>
            </div>
            <button type="button" data-dropdown-action="cmd">
              <span style="font-size:15px;">🚀</span>
              <div style="flex:1;"><div style="font-weight:700;">Quick Launch (Command Menu)</div><div style="font-size:10px;color:#64748b;">Instant search & tools</div></div>
              <span style="font-size:10px;padding:2px 5px;border-radius:5px;background:#f1f5f9;color:#475569;font-weight:700;">⌘K</span>
            </button>
            <button type="button" data-dropdown-tab="invite">
              <span style="font-size:15px;">📩</span>
              <div style="flex:1;"><div style="font-weight:700;">Invite Collaborators</div><div style="font-size:10px;color:#64748b;">Roles, share links & permissions</div></div>
            </button>
            <button type="button" data-dropdown-tab="email">
              <span style="font-size:15px;">✉️</span>
              <div style="flex:1;"><div style="font-weight:700;">Manual Task Email</div><div style="font-size:10px;color:#64748b;">Send alerts & notifications</div></div>
            </button>
            <button type="button" data-dropdown-tab="status">
              <span style="font-size:15px;">🟢</span>
              <div style="flex:1;"><div style="font-weight:700;">Presence Status & "Ask In"</div><div style="font-size:10px;color:#64748b;">Custom statuses & sleep snoozing</div></div>
            </button>
            <button type="button" data-dropdown-tab="colors">
              <span style="font-size:15px;">🎨</span>
              <div style="flex:1;"><div style="font-weight:700;">Component Colors & Themes</div><div style="font-size:10px;color:#64748b;">Per-board high contrast styles</div></div>
            </button>
            <button type="button" data-dropdown-tab="boardbg">
              <span style="font-size:15px;">🖼️</span>
              <div style="flex:1;"><div style="font-weight:700;">Board BG & Templates</div><div style="font-size:10px;color:#64748b;">Wallpapers, gradients & templates</div></div>
            </button>
            <button type="button" data-dropdown-tab="hub">
              <span style="font-size:15px;">📦</span>
              <div style="flex:1;"><div style="font-weight:700;">Board Hub (Uploads & From VTB)</div><div style="font-size:10px;color:#64748b;">Flow-AI uploads & saved boards</div></div>
            </button>
            <button type="button" data-dropdown-tab="integrations">
              <span style="font-size:15px;">⚡</span>
              <div style="flex:1;"><div style="font-weight:700;">AI Models & Webhooks</div><div style="font-size:10px;color:#64748b;">Gemini 2.5, Discord & Slack</div></div>
            </button>
            <button type="button" data-dropdown-tab="calendar">
              <span style="font-size:15px;">📅</span>
              <div style="flex:1;"><div style="font-weight:700;">Calendar & CSV Export</div><div style="font-size:10px;color:#64748b;">Apple / Google Cal (.ics) & Excel</div></div>
            </button>
            <button type="button" data-dropdown-action="focus">
              <span style="font-size:15px;">⏱️</span>
              <div style="flex:1;"><div style="font-weight:700;">Focus Pomodoro Timer</div><div style="font-size:10px;color:#64748b;">25m deep work session</div></div>
            </button>
            <div style="border-top:1px solid #f1f5f9;margin-top:4px;padding-top:4px;">
              <button type="button" data-dropdown-tab="settings">
                <span style="font-size:15px;">⚙️</span>
                <div style="flex:1;"><div style="font-weight:700;">All Settings & Backups</div><div style="font-size:10px;color:#64748b;">Full workspace export/import</div></div>
              </button>
            </div>
          </div>
        </div>

        <button type="button" class="vtb-sub-btn" data-vtb-open="status" id="vtb-sub-status-pill">🟢 Available</button>
        <button type="button" class="vtb-sub-btn" id="vtb-sub-focus-pill" style="display:none;">⏱️ Focus 25:00</button>
      `;

      // Toggle dropdown on Settings click
      const trigger = bar.querySelector('#vtb-sub-settings-trigger');
      const dropdown = bar.querySelector('#vtb-settings-dropdown');
      const caret = bar.querySelector('#vtb-settings-caret');

      const toggleDropdown = (show) => {
        const isShow = show !== undefined ? show : dropdown.style.display === 'none';
        dropdown.style.display = isShow ? 'flex' : 'none';
        if (caret) caret.style.transform = isShow ? 'rotate(180deg)' : 'rotate(0deg)';
      };

      trigger.onclick = (e) => {
        e.stopPropagation();
        toggleDropdown();
      };

      // Click outside to close dropdown
      document.addEventListener('click', (e) => {
        if (!bar.contains(e.target)) toggleDropdown(false);
      });

      // Actions inside dropdown
      bar.querySelectorAll('[data-dropdown-tab]').forEach((b) => {
        b.onclick = (e) => {
          e.stopPropagation();
          toggleDropdown(false);
          openUnifiedModal(b.dataset.dropdownTab);
        };
      });

      bar.querySelector('[data-dropdown-action="cmd"]').onclick = (e) => {
        e.stopPropagation();
        toggleDropdown(false);
        openCommandPalette();
      };

      bar.querySelector('[data-dropdown-action="focus"]').onclick = (e) => {
        e.stopPropagation();
        toggleDropdown(false);
        toggleFocusTimer();
      };

      bar.querySelector('#vtb-sub-status-pill').onclick = () => openUnifiedModal('status');
      bar.querySelector('#vtb-sub-focus-pill').onclick = toggleFocusTimer;
    }

    const hubBar = document.querySelector('.vtb-glass-hub-bar') || document.querySelector('.top-banner');
    if (hubBar && hubBar.nextElementSibling !== bar) {
      hubBar.insertAdjacentElement('afterend', bar);
    } else if (!hubBar && !bar.parentElement && document.body) {
      document.body.insertBefore(bar, document.body.firstChild);
    }
    updateSubBarStatus();
  }

  /* ---------- 4. Unified Modal (Settings + Invite + Email + Status + Colors + Board BG + Board Hub) ---------- */
  function closeUnifiedModal() {
    document.getElementById('vtb-pro-modal-backdrop')?.remove();
  }

  function openUnifiedModal(activeTab = 'settings') {
    closeUnifiedModal();
    const board = getCurrentBoardInfo();
    const t = getBoardTheme(board.id);

    const backdrop = document.createElement('div');
    backdrop.id = 'vtb-pro-modal-backdrop';
    backdrop.onclick = (e) => { if (e.target === backdrop) closeUnifiedModal(); };

    const tabs = [
      { id: 'settings', label: '⚙️ All Settings' },
      { id: 'integrations', label: '⚡ AI & Webhooks' },
      { id: 'calendar', label: '📅 Calendar & CSV' },
      { id: 'invite', label: '📩 Invite' },
      { id: 'email', label: '✉️ Manual Task Email' },
      { id: 'status', label: '🟢 Status & Ask In' },
      { id: 'colors', label: '🎨 Component Colors' },
      { id: 'boardbg', label: '🖼️ Board BG & Templates' },
      { id: 'hub', label: '📦 Board Hub (Uploads & From VTB)' }
    ];

    const dialog = document.createElement('div');
    dialog.className = 'vtb-pro-dialog';
    dialog.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#0f172a;color:#ffffff;">
        <div>
          <div style="font-weight:800;font-size:16px;">VTB Control Center & Board Hub</div>
          <div style="font-size:11.5px;color:#94a3b8;">Board: <strong style="color:#fff;">${esc(board.name)}</strong> • Account: ${esc(accountEmail || 'Local Guest (Sign in to sync across devices)')}</div>
        </div>
        <button type="button" id="vtb-pro-close" style="background:rgba(255,255,255,0.16);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:9999px;padding:5px 12px;font-weight:700;">✕ Close</button>
      </div>
      <div id="vtb-pro-tabs" style="display:flex;flex-wrap:wrap;gap:6px;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        ${tabs.map((tb) => `<button type="button" data-tab="${tb.id}" style="padding:6px 12px;border-radius:9999px;border:1px solid ${tb.id === activeTab ? '#2563EB' : '#cbd5e1'};background:${tb.id === activeTab ? '#2563EB' : '#ffffff'};color:${tb.id === activeTab ? '#ffffff' : '#0f172a'};font-weight:700;font-size:12px;">${tb.label}</button>`).join('')}
      </div>
      <div id="vtb-pro-body" style="padding:18px;overflow-y:auto;flex:1;background:#ffffff;color:#0f172a;"></div>
    `;

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    dialog.querySelector('#vtb-pro-close').onclick = closeUnifiedModal;
    dialog.querySelectorAll('#vtb-pro-tabs button').forEach((b) => {
      b.onclick = () => openUnifiedModal(b.dataset.tab);
    });

    const body = dialog.querySelector('#vtb-pro-body');

    /* --- TAB: ALL SETTINGS OVERVIEW --- */
    if (activeTab === 'settings') {
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;">
          ${[
            ['invite', '📩 Invite Collaborators', 'Standard roles, custom message, logo upload & instant share link.'],
            ['email', '✉️ Manual Task Email', 'Standard templates, custom message, color & file attachments.'],
            ['status', '🟢 Status & Sleep "Ask In"', 'Standard + custom status, custom icon upload, badge colors & Ask In timer.'],
            ['colors', '🎨 Component Colors & Themes', 'Standard high-contrast themes + color picker for every UI component.'],
            ['boardbg', '🖼️ Per-Board Background & Templates', 'Set unique solid/gradient/uploaded image per board & save templates.'],
            ['hub', '📦 Board Hub: Uploads & From VTB', 'Flow-AI drag & drop uploads + account-saved VTB boards & backups.']
          ].map(([id, title, desc]) => `
            <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-weight:800;font-size:14px;color:#0f172a;margin-bottom:4px;">${title}</div>
                <div style="font-size:12px;color:#475569;">${desc}</div>
              </div>
              <button type="button" data-go="${id}" style="align-self:flex-start;padding:6px 12px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12px;">Open →</button>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:16px;padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-weight:800;font-size:13px;">💾 Full Account Backup & Restore (.vtb.json)</div>
            <div style="font-size:11.5px;color:#475569;">Export or restore all themes, templates, settings, statuses, and saved VTB items.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="vtb-export-all" style="padding:7px 13px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-weight:700;font-size:12px;">⬇️ Export Backup</button>
            <label style="padding:7px 13px;border-radius:10px;background:#0f172a;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">⬆️ Import Backup<input type="file" id="vtb-import-all" accept=".json" style="display:none;"></label>
          </div>
        </div>
      `;
      body.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => openUnifiedModal(b.dataset.go); });
      body.querySelector('#vtb-export-all').onclick = () => {
        const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `vtb-account-backup-${new Date().toISOString().slice(0, 10)}.vtb.json`;
        a.click();
        showToast('Backup exported!');
      };
      body.querySelector('#vtb-import-all').onchange = (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            store = { ...defaultStore(), ...JSON.parse(r.result) };
            syncPrefsToCloud();
            applyBoardTheme();
            updateSubBarStatus();
            showToast('Account backup restored!');
            openUnifiedModal('settings');
          } catch { showToast('Invalid backup JSON file.'); }
        };
        r.readAsText(f);
      };
    }

    /* --- TAB: INVITE --- */
    if (activeTab === 'invite') {
      body.innerHTML = `
        <div style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 160px;gap:10px;">
            <label style="font-size:12px;font-weight:700;">Teammate Email *<input id="inv-email" type="email" placeholder="teammate@gmail.com" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;"></label>
            <label style="font-size:12px;font-weight:700;">Standard Role
              <select id="inv-role" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
                <option value="Editor">Editor (Full access)</option>
                <option value="Viewer">Viewer (Read only)</option>
                <option value="Admin">Admin (Manage board)</option>
                <option value="Commenter">Commenter</option>
              </select>
            </label>
          </div>
          <label style="font-size:12px;font-weight:700;">Custom Invite Message<textarea id="inv-msg" rows="2" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">Join me on "${esc(board.name)}" in Free VTB Virtual Task Board!</textarea></label>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;">Invite Accent Color <input id="inv-color" type="color" value="${esc(t.accent)}"></label>
            <button type="button" id="inv-send" style="padding:8px 16px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12.5px;">📩 Send Invite</button>
            <button type="button" id="inv-copy" style="padding:8px 14px;border-radius:9999px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:12.5px;">🔗 Copy Invite Link</button>
          </div>
          <div style="border-top:1px solid #e2e8f0;padding-top:10px;">
            <div style="font-weight:800;font-size:12.5px;margin-bottom:6px;">Sent Invites (${store.invites.length})</div>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;">
              ${store.invites.length === 0 ? '<div style="font-size:12px;color:#64748b;">No invites sent yet.</div>' : store.invites.map((inv) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #e2e8f0;border-left:4px solid ${esc(inv.color || '#2563EB')};border-radius:10px;background:#f8fafc;font-size:12px;">
                  <div><strong>${esc(inv.email)}</strong> • ${esc(inv.role)} <span style="color:#64748b;">(${esc(inv.boardName)})</span></div>
                  <button type="button" data-del-inv="${esc(inv.id)}" style="padding:3px 9px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-weight:700;font-size:11px;">Revoke</button>
                </div>`).join('')}
            </div>
          </div>
        </div>
      `;
      body.querySelector('#inv-copy').onclick = () => {
        const link = `${location.origin}/?inviteBoard=${encodeURIComponent(board.id)}&from=${encodeURIComponent(accountEmail || accountName)}`;
        navigator.clipboard?.writeText(link);
        showToast('Invite link copied to clipboard!');
      };
      body.querySelector('#inv-send').onclick = async () => {
        const email = body.querySelector('#inv-email').value.trim();
        if (!email) { showToast('Please enter a teammate email.'); return; }
        const role = body.querySelector('#inv-role').value;
        const msg = body.querySelector('#inv-msg').value.trim();
        const color = body.querySelector('#inv-color').value;
        const inv = { id: uid('inv'), email, role, msg, color, boardId: board.id, boardName: board.name, from: accountEmail || accountName, at: Date.now() };
        store.invites.unshift(inv);
        syncPrefsToCloud();
        if (fbDb && fbMod && accountId !== 'guest') {
          try { await fbMod.setDoc(fbMod.doc(fbDb, 'vtb_invites', inv.id), inv); } catch {}
        }
        try {
          await fetch('/api/send-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: email, subject: `VTB Invite: ${board.name}`, text: `${msg}\n\nOpen: ${location.origin}/?inviteBoard=${encodeURIComponent(board.id)}` })
          });
        } catch {}
        showToast(`Invite created & dispatched to ${email}!`);
        openUnifiedModal('invite');
      };
      body.querySelectorAll('[data-del-inv]').forEach((b) => {
        b.onclick = () => {
          store.invites = store.invites.filter((x) => x.id !== b.dataset.delInv);
          syncPrefsToCloud();
          openUnifiedModal('invite');
        };
      });
    }

    /* --- TAB: MANUAL TASK EMAIL --- */
    if (activeTab === 'email') {
      body.innerHTML = `
        <div style="display:grid;gap:10px;">
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <span style="font-size:12px;font-weight:700;">Standard Templates:</span>
            ${Object.entries({ assign: 'Task Assignment', reminder: 'Due Reminder', overdue: 'Overdue Alert', update: 'Board Update' }).map(([k, lbl]) => `
              <button type="button" data-etpl="${k}" style="padding:5px 10px;border-radius:9999px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-weight:700;font-size:11.5px;">${lbl}</button>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <label style="font-size:12px;font-weight:700;">Recipient Email *<input id="em-to" type="email" placeholder="user@gmail.com" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;"></label>
            <label style="font-size:12px;font-weight:700;">Task Title<input id="em-title" type="text" placeholder="e.g. Deploy Release" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;"></label>
          </div>
          <label style="font-size:12px;font-weight:700;">Subject<input id="em-subj" type="text" value="Task Notification — ${esc(board.name)}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;"></label>
          <label style="font-size:12px;font-weight:700;">Message Body<textarea id="em-body" rows="4" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">Hi,\n\nPlease check your assigned task on "${esc(board.name)}".\n\nBoard link: https://freevtbvirtualtaskboard.vercel.app/</textarea></label>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;">Banner Color <input id="em-color" type="color" value="${esc(t.primary)}"></label>
            <button type="button" id="em-send-api" style="padding:8px 16px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12.5px;">✉️ Send Email</button>
            <button type="button" id="em-open-mail" style="padding:8px 14px;border-radius:9999px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:12.5px;">📬 Open in Mail App</button>
          </div>
          <div style="border-top:1px solid #e2e8f0;padding-top:10px;">
            <div style="font-weight:800;font-size:12.5px;margin-bottom:6px;">Recent Manual Emails (${store.emailLog.length})</div>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:150px;overflow-y:auto;">
              ${store.emailLog.length === 0 ? '<div style="font-size:12px;color:#64748b;">No manual task emails logged yet.</div>' : store.emailLog.slice(0, 15).map((e) => `
                <div style="padding:7px 10px;border:1px solid #e2e8f0;border-left:4px solid ${esc(e.color || '#2563EB')};border-radius:10px;background:#f8fafc;font-size:12px;">
                  <strong>To: ${esc(e.to)}</strong> — ${esc(e.subject)} <span style="color:#64748b;">(${esc(e.status)})</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
      `;
      body.querySelectorAll('[data-etpl]').forEach((b) => {
        b.onclick = () => {
          const tpl = EMAIL_TEMPLATES[b.dataset.etpl];
          const taskTitle = body.querySelector('#em-title').value.trim() || 'Board Task';
          const fill = (s) => s.replace(/\{\{title\}\}/g, taskTitle).replace(/\{\{lane\}\}/g, 'Active Lane').replace(/\{\{priority\}\}/g, 'High').replace(/\{\{due\}\}/g, new Date(Date.now() + 86400000).toLocaleDateString());
          body.querySelector('#em-subj').value = fill(tpl.subject);
          body.querySelector('#em-body').value = fill(tpl.body);
        };
      });
      body.querySelector('#em-open-mail').onclick = () => {
        const to = body.querySelector('#em-to').value.trim();
        const subj = body.querySelector('#em-subj').value.trim();
        const txt = body.querySelector('#em-body').value;
        window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(txt)}`);
      };
      body.querySelector('#em-send-api').onclick = async () => {
        const to = body.querySelector('#em-to').value.trim();
        if (!to) { showToast('Enter recipient email first.'); return; }
        const subject = body.querySelector('#em-subj').value.trim();
        const text = body.querySelector('#em-body').value;
        const color = body.querySelector('#em-color').value;
        let status = 'Logged';
        try {
          const res = await fetch('/api/send-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, text, accentColor: color })
          });
          status = res.ok ? 'Delivered' : 'Queued (Use Mail App if SMTP not set)';
        } catch { status = 'Saved to Outbox'; }
        store.emailLog.unshift({ id: uid('em'), to, subject, color, status, at: Date.now() });
        syncPrefsToCloud();
        showToast(`Email ${status}: ${to}`);
        openUnifiedModal('email');
      };
    }

    /* --- TAB: STATUS & ASK IN --- */
    if (activeTab === 'status') {
      const st = store.status || STANDARD_STATUSES[0];
      body.innerHTML = `
        <div style="display:grid;gap:14px;">
          <div>
            <div style="font-weight:800;font-size:13px;margin-bottom:8px;">Standard Status Options</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${STANDARD_STATUSES.map((s) => `
                <button type="button" data-std-st="${s.id}" style="padding:7px 13px;border-radius:9999px;border:2px solid ${st.label === s.label ? '#0f172a' : 'transparent'};background:${s.bg};color:${s.fg};font-weight:700;font-size:12.5px;">${s.emoji} ${s.label}</button>`).join('')}
            </div>
          </div>
          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:grid;gap:10px;">
            <div style="font-weight:800;font-size:13px;">Custom Status, Icon Upload & Colors</div>
            <div style="display:grid;grid-template-columns:70px 1fr;gap:8px;">
              <input id="st-emoji" type="text" value="${esc(st.emoji || '🟢')}" placeholder="Emoji" style="padding:8px;border:1px solid #cbd5e1;border-radius:10px;text-align:center;">
              <input id="st-label" type="text" value="${esc(st.label || 'Available')}" placeholder="Custom status text..." style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
              <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;">Pill Color <input id="st-bg" type="color" value="${esc(st.bg || '#dcfce7')}"></label>
              <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;">Text Color <input id="st-fg" type="color" value="${esc(st.fg || '#166534')}"></label>
              <label style="padding:6px 12px;border-radius:9999px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;font-size:11.5px;cursor:pointer;">🖼️ Upload Icon<input id="st-icon-file" type="file" accept="image/*" style="display:none;"></label>
              <button type="button" id="st-save" style="padding:7px 16px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12px;">Save Custom Status</button>
            </div>
          </div>
          <div id="st-ask-in-container"></div>
        </div>
      `;
      let uploadedIcon = st.customIcon || '';
      body.querySelectorAll('[data-std-st]').forEach((b) => {
        b.onclick = () => {
          const found = STANDARD_STATUSES.find((s) => s.id === b.dataset.stdSt);
          store.status = { ...found, customIcon: '' };
          syncPrefsToCloud();
          updateSubBarStatus();
          showToast(`Status updated to ${found.emoji} ${found.label}`);
          openUnifiedModal('status');
        };
      });
      body.querySelector('#st-icon-file').onchange = async (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        const { dataUrl } = await readFileSmart(f);
        uploadedIcon = dataUrl;
        showToast('Custom status icon loaded — click Save Custom Status!');
      };
      body.querySelector('#st-save').onclick = () => {
        store.status = {
          id: 'custom',
          emoji: body.querySelector('#st-emoji').value.trim() || '✨',
          label: body.querySelector('#st-label').value.trim() || 'Custom',
          bg: body.querySelector('#st-bg').value,
          fg: body.querySelector('#st-fg').value,
          customIcon: uploadedIcon
        };
        syncPrefsToCloud();
        updateSubBarStatus();
        showToast('Custom status saved!');
      };
      const askContainer = body.querySelector('#st-ask-in-container');
      if (askContainer) {
        const picker = buildAskInPicker(store.askInMinutes || 15, () => {
          openUnifiedModal('status');
        });
        askContainer.appendChild(picker);
      }
    }

    /* --- TAB: COMPONENT COLORS & STANDARD THEMES --- */
    if (activeTab === 'colors') {
      body.innerHTML = `
        <div style="display:grid;gap:14px;">
          <div>
            <div style="font-weight:800;font-size:13px;margin-bottom:8px;">Standard High-Contrast Themes (for "${esc(board.name)}")</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${STANDARD_THEMES.map((th) => `
                <button type="button" data-theme-id="${th.id}" style="padding:7px 13px;border-radius:9999px;border:2px solid #cbd5e1;background:${th.bg};color:${getContrastText(th.bg)};font-weight:700;font-size:12px;">${th.name}</button>`).join('')}
            </div>
          </div>
          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;">
            <div style="font-weight:800;font-size:13px;margin-bottom:10px;">Customize Color for Each & Every Component</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;">
              ${[
                ['bg', 'Board Background', t.bg],
                ['header', 'Header & Nav Bar', t.header],
                ['lane', 'Kanban Lanes', t.lane],
                ['card', 'Task Cards', t.card],
                ['primary', 'Primary Buttons', t.primary],
                ['btn', 'Secondary Buttons', t.btn],
                ['accent', 'Accent Highlights', t.accent]
              ].map(([k, lbl, val]) => `
                <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;font-weight:700;">
                  <span>${lbl}</span>
                  <input type="color" data-comp="${k}" value="${esc(val)}">
                </label>`).join('')}
            </div>
            <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="col-save-board" style="padding:8px 16px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12px;">Save for This Board Only</button>
              <button type="button" id="col-save-all" style="padding:8px 14px;border-radius:9999px;background:#0f172a;color:#fff;border:none;font-weight:700;font-size:12px;">Set as Default for All Boards</button>
              <button type="button" id="col-reset" style="padding:8px 14px;border-radius:9999px;background:#fff;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:12px;">Reset to Classic Blue</button>
            </div>
          </div>
        </div>
      `;
      const readPickers = () => {
        const next = { ...getBoardTheme(board.id) };
        body.querySelectorAll('[data-comp]').forEach((inp) => { next[inp.dataset.comp] = inp.value; });
        return next;
      };
      body.querySelectorAll('[data-comp]').forEach((inp) => {
        inp.oninput = () => {
          store.boardThemes[board.id] = readPickers();
          applyBoardTheme();
        };
      });
      body.querySelectorAll('[data-theme-id]').forEach((b) => {
        b.onclick = () => {
          const th = STANDARD_THEMES.find((x) => x.id === b.dataset.themeId);
          store.boardThemes[board.id] = { ...getBoardTheme(board.id), ...th, bgImage: 'none', bgOverlay: 0 };
          applyBoardTheme();
          syncPrefsToCloud();
          showToast(`Applied "${th.name}" to ${board.name}!`);
          openUnifiedModal('colors');
        };
      });
      body.querySelector('#col-save-board').onclick = () => {
        store.boardThemes[board.id] = readPickers();
        applyBoardTheme(); syncPrefsToCloud();
        showToast(`Saved custom component colors for "${board.name}"!`);
      };
      body.querySelector('#col-save-all').onclick = () => {
        const next = readPickers();
        store.boardThemes['__default__'] = next;
        store.boardThemes[board.id] = next;
        applyBoardTheme(); syncPrefsToCloud();
        showToast('Saved as default component theme for all boards!');
      };
      body.querySelector('#col-reset').onclick = () => {
        delete store.boardThemes[board.id];
        applyBoardTheme(); syncPrefsToCloud();
        showToast('Reset board theme to Classic Solid Blue.');
        openUnifiedModal('colors');
      };
    }

    /* --- TAB: PER-BOARD BACKGROUND & TEMPLATES --- */
    if (activeTab === 'boardbg') {
      body.innerHTML = `
        <div style="display:grid;gap:14px;">
          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;">
            <div style="font-weight:800;font-size:13.5px;margin-bottom:8px;">🖼️ Separate Background for "${esc(board.name)}"</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
              ${STANDARD_GRADIENTS.map((g, i) => `
                <button type="button" data-grad="${i}" style="padding:6px 11px;border-radius:9999px;border:1px solid #cbd5e1;background:${g.css === 'none' ? '#2563EB' : g.css};color:#fff;font-weight:700;font-size:11.5px;">${g.name}</button>`).join('')}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
              <label style="padding:7px 14px;border-radius:9999px;background:#2563EB;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">📤 Upload Custom Background Image<input id="bg-upload" type="file" accept="image/*" style="display:none;"></label>
              <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;">Readability Dimmer <input id="bg-dim" type="range" min="0" max="0.65" step="0.05" value="${Number(t.bgOverlay || 0)}"></label>
              <button type="button" id="bg-clear-img" style="padding:6px 12px;border-radius:9999px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;font-size:12px;">Remove Image</button>
            </div>
          </div>

          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;">
            <div style="font-weight:800;font-size:13.5px;margin-bottom:8px;">📋 Save Current Board & Theme as Reusable Template</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
              <input id="tpl-name" type="text" placeholder="Template name (e.g. Q4 Product Launch)" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
              <button type="button" id="tpl-save-btn" style="padding:8px 15px;border-radius:9999px;background:#059669;color:#fff;border:none;font-weight:700;font-size:12px;">+ Save Template</button>
              <label style="padding:8px 13px;border-radius:9999px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;">⬆️ Upload JSON Template<input id="tpl-upload" type="file" accept=".json" style="display:none;"></label>
            </div>
            <div style="font-weight:700;font-size:12px;color:#475569;margin-bottom:6px;">Standard & Your Saved Templates (${STANDARD_TEMPLATES.length + store.templates.length})</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
              ${STANDARD_TEMPLATES.map((stpl) => `
                <div style="padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;">
                  <div style="font-weight:800;font-size:12.5px;">⭐ ${esc(stpl.name)}</div>
                  <div style="font-size:11px;color:#64748b;margin:3px 0 8px;">${esc(stpl.desc)}</div>
                  <button type="button" data-apply-std-tpl="${stpl.id}" style="padding:4px 10px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:11px;">Apply Theme</button>
                </div>`).join('')}
              ${store.templates.map((utpl) => `
                <div style="padding:10px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;">
                  <div style="font-weight:800;font-size:12.5px;">📌 ${esc(utpl.name)}</div>
                  <div style="font-size:11px;color:#64748b;margin:3px 0 8px;">Saved from ${esc(utpl.sourceBoard || 'VTB')}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" data-apply-utpl="${esc(utpl.id)}" style="padding:4px 10px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:11px;">Apply</button>
                    <button type="button" data-dl-utpl="${esc(utpl.id)}" style="padding:4px 9px;border-radius:9999px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:11px;">JSON</button>
                    <button type="button" data-del-utpl="${esc(utpl.id)}" style="padding:4px 9px;border-radius:9999px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-weight:700;font-size:11px;">Delete</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      `;
      body.querySelectorAll('[data-grad]').forEach((b) => {
        b.onclick = () => {
          const g = STANDARD_GRADIENTS[Number(b.dataset.grad)];
          store.boardThemes[board.id] = { ...getBoardTheme(board.id), bgImage: g.css };
          applyBoardTheme(); syncPrefsToCloud();
          showToast(`Background "${g.name}" set for "${board.name}"!`);
        };
      });
      body.querySelector('#bg-upload').onchange = async (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        const { dataUrl } = await readFileSmart(f);
        store.boardThemes[board.id] = { ...getBoardTheme(board.id), bgImage: `url("${dataUrl}")`, bgOverlay: 0.2 };
        applyBoardTheme(); syncPrefsToCloud();
        showToast(`Custom background uploaded for "${board.name}"!`);
      };
      body.querySelector('#bg-dim').oninput = (ev) => {
        store.boardThemes[board.id] = { ...getBoardTheme(board.id), bgOverlay: Number(ev.target.value) };
        applyBoardTheme();
      };
      body.querySelector('#bg-dim').onchange = () => syncPrefsToCloud();
      body.querySelector('#bg-clear-img').onclick = () => {
        store.boardThemes[board.id] = { ...getBoardTheme(board.id), bgImage: 'none', bgOverlay: 0 };
        applyBoardTheme(); syncPrefsToCloud();
        showToast('Custom background removed.');
      };
      body.querySelector('#tpl-save-btn').onclick = () => {
        const name = body.querySelector('#tpl-name').value.trim() || `${board.name} Template`;
        const tpl = { id: uid('tpl'), name, sourceBoard: board.name, theme: getBoardTheme(board.id), snapshot: captureVtbLocalData(), at: Date.now() };
        store.templates.unshift(tpl);
        syncPrefsToCloud();
        showToast(`Saved template "${name}"!`);
        openUnifiedModal('boardbg');
      };
      body.querySelector('#tpl-upload').onchange = (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          try {
            const parsed = JSON.parse(r.result);
            store.templates.unshift({ id: uid('tpl'), name: parsed.name || f.name.replace(/\.json$/i, ''), sourceBoard: 'Uploaded', theme: parsed.theme || getBoardTheme(board.id), snapshot: parsed.snapshot || parsed, at: Date.now() });
            syncPrefsToCloud();
            showToast('Template uploaded!');
            openUnifiedModal('boardbg');
          } catch { showToast('Invalid JSON template.'); }
        };
        r.readAsText(f);
      };
      body.querySelectorAll('[data-apply-std-tpl]').forEach((b) => {
        b.onclick = () => {
          const stpl = STANDARD_TEMPLATES.find((x) => x.id === b.dataset.applyStdTpl);
          const th = STANDARD_THEMES.find((x) => x.id === stpl.themeId) || STANDARD_THEMES[0];
          store.boardThemes[board.id] = { ...getBoardTheme(board.id), ...th, bgImage: 'none', bgOverlay: 0 };
          applyBoardTheme(); syncPrefsToCloud();
          showToast(`Applied "${stpl.name}" template style!`);
        };
      });
      body.querySelectorAll('[data-apply-utpl]').forEach((b) => {
        b.onclick = () => {
          const utpl = store.templates.find((x) => x.id === b.dataset.applyUtpl);
          if (!utpl) return;
          if (utpl.theme) { store.boardThemes[board.id] = { ...utpl.theme }; applyBoardTheme(); syncPrefsToCloud(); }
          showToast(`Applied template "${utpl.name}"!`);
        };
      });
      body.querySelectorAll('[data-dl-utpl]').forEach((b) => {
        b.onclick = () => {
          const utpl = store.templates.find((x) => x.id === b.dataset.dlUtpl);
          if (!utpl) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(utpl, null, 2)], { type: 'application/json' }));
          a.download = `${utpl.name.replace(/\s+/g, '-').toLowerCase()}.template.json`;
          a.click();
        };
      });
      body.querySelectorAll('[data-del-utpl]').forEach((b) => {
        b.onclick = () => {
          store.templates = store.templates.filter((x) => x.id !== b.dataset.delUtpl);
          syncPrefsToCloud();
          openUnifiedModal('boardbg');
        };
      });
    }

    /* --- TAB: BOARD HUB (Flow AI Drag & Drop Uploads + From VTB Account Vault) --- */
    if (activeTab === 'hub') {
      renderBoardHub(body, board);
    }

    /* --- TAB: AI, WEBHOOKS & INTEGRATIONS --- */
    if (activeTab === 'integrations') {
      const it = store.integrations = { ...defaultStore().integrations, ...(store.integrations || {}) };
      body.innerHTML = `
        <div style="display:grid;gap:16px;">
          <!-- Section 1: Gemini AI Model & Key -->
          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:grid;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div>
                <strong style="font-size:13.5px;color:#0f172a;">🤖 Google Gemini AI Model & API Configuration</strong>
                <div style="font-size:11.5px;color:#64748b;">Powers AI Chat, Board Analytics, Quick Capture & Smart Transcription</div>
              </div>
              <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;background:#dcfce7;color:#166534;">Backend Endpoint Active</span>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <label style="font-size:12px;font-weight:700;">Select Gemini Model
                <select id="vtb-ai-model-sel" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font-weight:600;">
                  <option value="gemini-2.5-flash" ${it.geminiModel === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash (Recommended: Fastest & Smartest)</option>
                  <option value="gemini-2.0-flash" ${it.geminiModel === 'gemini-2.0-flash' ? 'selected' : ''}>gemini-2.0-flash (Next-Gen Multimodal)</option>
                  <option value="gemini-1.5-pro" ${it.geminiModel === 'gemini-1.5-pro' ? 'selected' : ''}>gemini-1.5-pro (Deep Reasoning & Analysis)</option>
                  <option value="gemini-1.5-flash" ${it.geminiModel === 'gemini-1.5-flash' ? 'selected' : ''}>gemini-1.5-flash (Production Stable)</option>
                  <option value="custom" ${!['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-pro','gemini-1.5-flash'].includes(it.geminiModel) ? 'selected' : ''}>Custom Model ID...</option>
                </select>
              </label>

              <label style="font-size:12px;font-weight:700;">Custom Model ID (Optional)
                <input id="vtb-ai-custom-model" type="text" placeholder="e.g. gemini-exp-1206 or custom" value="${!['gemini-2.5-flash','gemini-2.0-flash','gemini-1.5-pro','gemini-1.5-flash'].includes(it.geminiModel) ? esc(it.geminiModel) : ''}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
              </label>
            </div>

            <label style="font-size:12px;font-weight:700;">Gemini API Key (Optional — overrides server default)
              <input id="vtb-ai-api-key" type="password" placeholder="AIzaSy... (Leave empty to use server/offline intelligence)" value="${esc(it.geminiApiKey || '')}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;font-family:monospace;">
            </label>

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
              <button type="button" id="vtb-ai-save-btn" style="padding:7px 16px;border-radius:99px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12px;">Save AI Settings</button>
              <button type="button" id="vtb-ai-test-btn" style="padding:7px 14px;border-radius:99px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:12px;">⚡ Test AI Connection</button>
              <span id="vtb-ai-test-result" style="font-size:11.5px;font-weight:600;color:#64748b;"></span>
            </div>
          </div>

          <!-- Section 2: Discord & Slack Webhooks -->
          <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:grid;gap:10px;">
            <div>
              <strong style="font-size:13.5px;color:#0f172a;">💬 Team Chat Webhooks (Discord & Slack)</strong>
              <div style="font-size:11.5px;color:#64748b;">Broadcast task completions and urgent P1 task alerts directly to your channel</div>
            </div>

            <label style="font-size:12px;font-weight:700;">Discord Webhook URL
              <input id="vtb-wh-discord" type="url" placeholder="https://discord.com/api/webhooks/..." value="${esc(it.discordWebhook || '')}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
            </label>

            <label style="font-size:12px;font-weight:700;">Slack Incoming Webhook URL
              <input id="vtb-wh-slack" type="url" placeholder="https://hooks.slack.com/services/..." value="${esc(it.slackWebhook || '')}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
            </label>

            <label style="font-size:12px;font-weight:700;">Generic / Zapier / Make Webhook URL
              <input id="vtb-wh-generic" type="url" placeholder="https://webhook.site/... or Zapier webhook" value="${esc(it.genericWebhook || '')}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
            </label>

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
              <button type="button" id="vtb-wh-save-btn" style="padding:7px 16px;border-radius:99px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12px;">Save Webhooks</button>
              <button type="button" id="vtb-wh-test-btn" style="padding:7px 14px;border-radius:99px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:12px;">📣 Send Test Alert</button>
            </div>
          </div>
        </div>
      `;

      body.querySelector('#vtb-ai-save-btn').onclick = () => {
        const sel = body.querySelector('#vtb-ai-model-sel').value;
        const custom = body.querySelector('#vtb-ai-custom-model').value.trim();
        const chosenModel = sel === 'custom' ? (custom || 'gemini-2.5-flash') : sel;
        store.integrations.geminiModel = chosenModel;
        store.integrations.geminiApiKey = body.querySelector('#vtb-ai-api-key').value.trim();
        syncPrefsToCloud();
        showToast(`AI settings saved! Active Model: ${chosenModel}`);
      };

      body.querySelector('#vtb-ai-test-btn').onclick = async () => {
        const resEl = body.querySelector('#vtb-ai-test-result');
        resEl.textContent = 'Testing connection...';
        try {
          const res = await fetch('/api/gemini/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-gemini-api-key': body.querySelector('#vtb-ai-api-key').value.trim(),
              'x-gemini-model': body.querySelector('#vtb-ai-model-sel').value === 'custom' ? body.querySelector('#vtb-ai-custom-model').value.trim() : body.querySelector('#vtb-ai-model-sel').value
            },
            body: JSON.stringify({ message: 'ping', boardContext: board })
          });
          const d = await res.json();
          resEl.textContent = `✅ Connected (${d.modelUsed || 'active'})`;
          resEl.style.color = '#166534';
        } catch (e) {
          resEl.textContent = `⚠️ Connection error: ${e.message}`;
          resEl.style.color = '#b91c1c';
        }
      };

      body.querySelector('#vtb-wh-save-btn').onclick = () => {
        store.integrations.discordWebhook = body.querySelector('#vtb-wh-discord').value.trim();
        store.integrations.slackWebhook = body.querySelector('#vtb-wh-slack').value.trim();
        store.integrations.genericWebhook = body.querySelector('#vtb-wh-generic').value.trim();
        syncPrefsToCloud();
        showToast('Webhook integrations saved!');
      };

      body.querySelector('#vtb-wh-test-btn').onclick = async () => {
        await sendWebhookNotification('Integration Test', 'Test task alert from VTB Pro', board.name, 'All webhook channels verified');
        showToast('📣 Test alert dispatched to all configured webhooks!');
      };
    }

    /* --- TAB: CALENDAR & CSV EXPORT --- */
    if (activeTab === 'calendar') {
      body.innerHTML = `
        <div style="display:grid;gap:14px;">
          <div style="padding:16px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-weight:800;font-size:14px;color:#0f172a;">📅 Apple / Google / Outlook Calendar Export (.ics)</div>
              <div style="font-size:12px;color:#64748b;margin-top:3px;">Export all tasks with due dates directly into your calendar with 1-hour and 1-day reminders.</div>
            </div>
            <button type="button" id="vtb-cal-export-btn" style="padding:9px 18px;border-radius:99px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12.5px;cursor:pointer;">📅 Export Calendar (.ics)</button>
          </div>

          <div style="padding:16px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-weight:800;font-size:14px;color:#0f172a;">📊 CSV / Excel Spreadsheet Export</div>
              <div style="font-size:12px;color:#64748b;margin-top:3px;">Export your complete board including task IDs, lanes, priorities, assignees, due dates and labels to CSV.</div>
            </div>
            <button type="button" id="vtb-csv-export-btn" style="padding:9px 18px;border-radius:99px;background:#059669;color:#fff;border:none;font-weight:700;font-size:12.5px;cursor:pointer;">📊 Export CSV Spreadsheet</button>
          </div>

          <div style="padding:16px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-weight:800;font-size:14px;color:#0f172a;">🖨️ High-Resolution Board Printout</div>
              <div style="font-size:12px;color:#64748b;margin-top:3px;">Format and print the current visual Kanban board with task breakdown and WIP limits.</div>
            </div>
            <button type="button" id="vtb-print-board-btn" style="padding:9px 18px;border-radius:99px;background:#0f172a;color:#fff;border:none;font-weight:700;font-size:12.5px;cursor:pointer;">🖨️ Print Board</button>
          </div>
        </div>
      `;

      body.querySelector('#vtb-cal-export-btn').onclick = () => exportBoardToIcs(board);
      body.querySelector('#vtb-csv-export-btn').onclick = () => exportBoardToCsv(board);
      body.querySelector('#vtb-print-board-btn').onclick = () => window.print();
    }

    fixButtonColors(dialog);
  }

  /* ---------- Capture & Restore VTB Workspace Snapshots ("From VTB") ---------- */
  function captureVtbLocalData() {
    const dump = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.startsWith(LS_PREFIX) || k.startsWith('firebase:')) continue;
      const v = localStorage.getItem(k);
      if (v && v.length < 350000) dump[k] = v;
    }
    return dump;
  }

  function restoreVtbLocalData(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    Object.entries(snapshot).forEach(([k, v]) => {
      try { localStorage.setItem(k, v); } catch {}
    });
  }

  let activeHubSub = 'uploads';
  function renderBoardHub(container, board) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <div style="display:flex;gap:8px;">
          <button type="button" id="hub-tab-uploads" style="padding:7px 14px;border-radius:9999px;border:1px solid ${activeHubSub === 'uploads' ? '#2563EB' : '#cbd5e1'};background:${activeHubSub === 'uploads' ? '#2563EB' : '#fff'};color:${activeHubSub === 'uploads' ? '#fff' : '#0f172a'};font-weight:800;font-size:12.5px;">📤 Uploads (${store.uploads.length})</button>
          <button type="button" id="hub-tab-vtb" style="padding:7px 14px;border-radius:9999px;border:1px solid ${activeHubSub === 'vtb' ? '#2563EB' : '#cbd5e1'};background:${activeHubSub === 'vtb' ? '#2563EB' : '#fff'};color:${activeHubSub === 'vtb' ? '#fff' : '#0f172a'};font-weight:800;font-size:12.5px;">🗂️ From VTB (${store.vtbSaved.length})</button>
        </div>
        <span style="font-size:11.5px;color:#475569;font-weight:600;">${accountId !== 'guest' ? `☁️ Synced to ${esc(accountEmail || accountId)}` : '💾 Saved locally (Sign in to sync across devices)'}</span>
      </div>
      <div id="hub-content"></div>
    `;
    container.querySelector('#hub-tab-uploads').onclick = () => { activeHubSub = 'uploads'; renderBoardHub(container, board); };
    container.querySelector('#hub-tab-vtb').onclick = () => { activeHubSub = 'vtb'; renderBoardHub(container, board); };

    const content = container.querySelector('#hub-content');

    if (activeHubSub === 'uploads') {
      content.innerHTML = `
        <div id="vtb-flow-drop" class="vtb-dropzone">
          <div style="font-size:26px;margin-bottom:4px;">📤</div>
          <div style="font-weight:800;font-size:14px;">Drag & Drop Files Here (Flow AI Style)</div>
          <div style="font-size:12px;color:#3b82f6;margin:4px 0 10px;">Upload images, docs, PDFs, CSVs, or JSON files directly to your Board Hub — available every time you log in.</div>
          <label style="display:inline-block;padding:8px 16px;border-radius:9999px;background:#2563EB;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">Browse Files<input id="vtb-flow-input" type="file" multiple style="display:none;"></label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:14px;">
          ${store.uploads.length === 0 ? '<div style="grid-column:1/-1;text-align:center;color:#64748b;padding:20px;font-size:12.5px;">No uploads yet. Drag and drop any file above!</div>' : store.uploads.map((u) => `
            <div style="border:1px solid #cbd5e1;border-top:4px solid ${esc(u.color || '#2563EB')};border-radius:14px;overflow:hidden;background:#f8fafc;display:flex;flex-direction:column;">
              ${u.isImage ? `<img src="${esc(u.dataUrl)}" style="width:100%;height:110px;object-fit:cover;background:#e2e8f0;">` : `<div style="height:76px;display:grid;place-items:center;font-size:28px;background:#e2e8f0;">📄</div>`}
              <div style="padding:9px;display:flex;flex-direction:column;gap:6px;flex:1;">
                <div style="font-weight:800;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(u.name)}">${esc(u.name)}</div>
                <div style="font-size:10.5px;color:#64748b;">${esc(u.boardName || 'Board Hub')} • ${Math.round((u.size || 0) / 1024)} KB</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:auto;">
                  ${u.isImage ? `<button type="button" data-up-bg="${esc(u.id)}" style="padding:4px 8px;border-radius:8px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:10.5px;">Set as Board BG</button>` : ''}
                  <a href="${esc(u.dataUrl)}" download="${esc(u.name)}" style="padding:4px 8px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;font-size:10.5px;text-decoration:none;">Download</a>
                  <button type="button" data-up-del="${esc(u.id)}" style="padding:4px 8px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-weight:700;font-size:10.5px;">Delete</button>
                </div>
              </div>
            </div>`).join('')}
        </div>
      `;

      const handleFiles = async (files) => {
        for (const f of Array.from(files || [])) {
          try {
            const { dataUrl, isImage } = await readFileSmart(f);
            const item = { id: uid('up'), name: f.name, type: f.type, size: f.size, isImage, dataUrl, color: '#2563EB', boardId: board.id, boardName: board.name, at: Date.now() };
            store.uploads.unshift(item);
            await syncUploadDoc(item, false);
            showToast(`Uploaded "${f.name}" to Board Hub!`);
          } catch (err) {
            showToast(err.message || `Could not upload ${f.name}`);
          }
        }
        renderBoardHub(container, board);
      };

      const dz = content.querySelector('#vtb-flow-drop');
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
      dz.ondragleave = () => dz.classList.remove('dragover');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('dragover'); handleFiles(e.dataTransfer.files); };
      content.querySelector('#vtb-flow-input').onchange = (e) => handleFiles(e.target.files);

      content.querySelectorAll('[data-up-bg]').forEach((b) => {
        b.onclick = () => {
          const item = store.uploads.find((x) => x.id === b.dataset.upBg);
          if (!item) return;
          store.boardThemes[board.id] = { ...getBoardTheme(board.id), bgImage: `url("${item.dataUrl}")`, bgOverlay: 0.2 };
          applyBoardTheme(); syncPrefsToCloud();
          showToast(`Set "${item.name}" as background for "${board.name}"!`);
        };
      });
      content.querySelectorAll('[data-up-del]').forEach((b) => {
        b.onclick = async () => {
          const item = store.uploads.find((x) => x.id === b.dataset.upDel);
          store.uploads = store.uploads.filter((x) => x.id !== b.dataset.upDel);
          if (item) await syncUploadDoc(item, true);
          renderBoardHub(container, board);
        };
      });
    } else {
      content.innerHTML = `
        <div style="padding:14px;border:1px solid #cbd5e1;border-radius:14px;background:#f8fafc;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;">
          <input id="vtb-save-title" type="text" value="${esc(board.name)} (${new Date().toLocaleDateString()})" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;">
          <input id="vtb-save-color" type="color" value="${esc(getBoardTheme(board.id).bg)}" title="Tag color">
          <button type="button" id="vtb-save-now" style="padding:8px 16px;border-radius:9999px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:12px;">💾 Save Current Board to VTB Hub</button>
          <label style="padding:8px 13px;border-radius:9999px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;font-weight:700;font-size:12px;cursor:pointer;">⬆️ Upload VTB JSON<input id="vtb-upload-json" type="file" accept=".json" style="display:none;"></label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">
          ${store.vtbSaved.length === 0 ? '<div style="grid-column:1/-1;text-align:center;color:#64748b;padding:20px;font-size:12.5px;">No saved VTB items yet. Click "Save Current Board to VTB Hub" above — everything saved here follows your account every time you log in!</div>' : store.vtbSaved.map((sv) => `
            <div style="padding:12px;border:1px solid #cbd5e1;border-left:5px solid ${esc(sv.color || '#2563EB')};border-radius:14px;background:#fff;display:flex;flex-direction:column;gap:8px;">
              <div>
                <div style="font-weight:800;font-size:13px;">🗂️ ${esc(sv.name)}</div>
                <div style="font-size:11px;color:#64748b;">Board: ${esc(sv.boardName)} • Saved ${new Date(sv.at).toLocaleString()}</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                <button type="button" data-sv-load="${esc(sv.id)}" style="padding:5px 10px;border-radius:8px;background:#2563EB;color:#fff;border:none;font-weight:700;font-size:11px;">Load Board</button>
                <button type="button" data-sv-theme="${esc(sv.id)}" style="padding:5px 10px;border-radius:8px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:11px;">Apply Theme</button>
                <button type="button" data-sv-dl="${esc(sv.id)}" style="padding:5px 9px;border-radius:8px;background:#fff;color:#0f172a;border:1px solid #cbd5e1;font-weight:700;font-size:11px;">Export</button>
                <button type="button" data-sv-del="${esc(sv.id)}" style="padding:5px 9px;border-radius:8px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-weight:700;font-size:11px;">Delete</button>
              </div>
            </div>`).join('')}
        </div>
      `;

      content.querySelector('#vtb-save-now').onclick = async () => {
        const name = content.querySelector('#vtb-save-title').value.trim() || board.name;
        const color = content.querySelector('#vtb-save-color').value;
        const item = { id: uid('vtb'), name, color, boardId: board.id, boardName: board.name, theme: getBoardTheme(board.id), snapshot: captureVtbLocalData(), at: Date.now() };
        store.vtbSaved.unshift(item);
        await syncSavedVtbDoc(item, false);
        showToast(`Saved "${name}" to From VTB!`);
        renderBoardHub(container, board);
      };
      content.querySelector('#vtb-upload-json').onchange = (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const parsed = JSON.parse(r.result);
            const item = { id: uid('vtb'), name: parsed.name || f.name.replace(/\.json$/i, ''), color: parsed.color || '#2563EB', boardId: parsed.boardId || board.id, boardName: parsed.boardName || board.name, theme: parsed.theme || getBoardTheme(board.id), snapshot: parsed.snapshot || parsed, at: Date.now() };
            store.vtbSaved.unshift(item);
            await syncSavedVtbDoc(item, false);
            showToast(`Imported "${item.name}" to From VTB!`);
            renderBoardHub(container, board);
          } catch { showToast('Invalid JSON file.'); }
        };
        r.readAsText(f);
      };
      content.querySelectorAll('[data-sv-load]').forEach((b) => {
        b.onclick = () => {
          const item = store.vtbSaved.find((x) => x.id === b.dataset.svLoad);
          if (!item) return;
          if (item.theme) { store.boardThemes[board.id] = { ...item.theme }; applyBoardTheme(); syncPrefsToCloud(); }
          if (item.snapshot) { restoreVtbLocalData(item.snapshot); showToast(`Restored "${item.name}" — refreshing board...`); setTimeout(() => location.reload(), 650); }
        };
      });
      content.querySelectorAll('[data-sv-theme]').forEach((b) => {
        b.onclick = () => {
          const item = store.vtbSaved.find((x) => x.id === b.dataset.svTheme);
          if (!item?.theme) return;
          store.boardThemes[board.id] = { ...item.theme };
          applyBoardTheme(); syncPrefsToCloud();
          showToast(`Applied theme from "${item.name}"!`);
        };
      });
      content.querySelectorAll('[data-sv-dl]').forEach((b) => {
        b.onclick = () => {
          const item = store.vtbSaved.find((x) => x.id === b.dataset.svDl);
          if (!item) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' }));
          a.download = `${item.name.replace(/\s+/g, '-').toLowerCase()}.vtb.json`;
          a.click();
        };
      });
      content.querySelectorAll('[data-sv-del]').forEach((b) => {
        b.onclick = async () => {
          const item = store.vtbSaved.find((x) => x.id === b.dataset.svDel);
          store.vtbSaved = store.vtbSaved.filter((x) => x.id !== b.dataset.svDel);
          if (item) await syncSavedVtbDoc(item, true);
          renderBoardHub(container, board);
        };
      });
    }
    fixButtonColors(container);
  }

  /* ---------- Bonus Feature 1: Focus Pomodoro Timer Synced with Status ---------- */
  function toggleFocusTimer() {
    const pill = document.getElementById('vtb-sub-focus-pill');
    const legacyBtn = document.getElementById('vtb-sub-focus-btn');
    if (focusInterval) {
      clearInterval(focusInterval);
      focusInterval = null;
      if (pill) pill.style.display = 'none';
      if (legacyBtn) legacyBtn.textContent = '⏱️ Focus 25m';
      store.status = { ...STANDARD_STATUSES[0], customIcon: '' };
      updateSubBarStatus(); syncPrefsToCloud();
      showToast('Focus session stopped — status back to Available.');
      return;
    }
    focusSecondsLeft = 25 * 60;
    if (pill) {
      pill.style.display = 'inline-flex';
      pill.textContent = '⏹️ Focus 25:00';
    }
    if (legacyBtn) legacyBtn.textContent = '⏹️ Focus 25:00';
    store.status = { ...STANDARD_STATUSES[4], customIcon: '' };
    updateSubBarStatus(); syncPrefsToCloud();
    showToast('🎯 25-min Focus Session started! Status set to Deep Focus.');
    const tick = () => {
      const m = String(Math.floor(focusSecondsLeft / 60)).padStart(2, '0');
      const s = String(focusSecondsLeft % 60).padStart(2, '0');
      if (pill) {
        pill.style.display = 'inline-flex';
        pill.textContent = `⏹️ Focus ${m}:${s}`;
      }
      if (legacyBtn) legacyBtn.textContent = `⏹️ Focus ${m}:${s}`;
      if (focusSecondsLeft <= 0) {
        clearInterval(focusInterval); focusInterval = null;
        if (pill) pill.style.display = 'none';
        if (legacyBtn) legacyBtn.textContent = '⏱️ Focus 25m';
        store.status = { ...STANDARD_STATUSES[0], customIcon: '' };
        updateSubBarStatus(); syncPrefsToCloud();
        showToast('🎉 Focus session complete! Status back to Available.');
      }
      focusSecondsLeft--;
    };
    tick();
    focusInterval = setInterval(tick, 1000);
  }

  /* ---------- Bonus Feature 2: Ctrl+K / Cmd+K Quick Command Palette ---------- */
  function openCommandPalette() {
    const actions = [
      { label: '⚙️ Open All Settings', fn: () => openUnifiedModal('settings') },
      { label: '📩 Invite Collaborator to Board', fn: () => openUnifiedModal('invite') },
      { label: '✉️ Send Manual Task Email', fn: () => openUnifiedModal('email') },
      { label: '🟢 Change Status or Set "Ask In" Timer', fn: () => openUnifiedModal('status') },
      { label: '🎨 Customize Every Component Color & Theme', fn: () => openUnifiedModal('colors') },
      { label: '🖼️ Set Per-Board Background & Save Template', fn: () => openUnifiedModal('boardbg') },
      { label: '📤 Open Board Hub: Drag & Drop Uploads', fn: () => { activeHubSub = 'uploads'; openUnifiedModal('hub'); } },
      { label: '🗂️ Open Board Hub: Saved From VTB', fn: () => { activeHubSub = 'vtb'; openUnifiedModal('hub'); } },
      { label: '⏱️ Start / Stop 25m Focus Timer', fn: toggleFocusTimer }
    ];
    closeUnifiedModal();
    const bd = document.createElement('div');
    bd.id = 'vtb-pro-modal-backdrop';
    bd.onclick = (e) => { if (e.target === bd) closeUnifiedModal(); };
    const box = document.createElement('div');
    box.className = 'vtb-pro-dialog';
    box.style.width = 'min(480px, 94vw)';
    box.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e2e8f0;"><input id="vtb-cmd-in" type="text" placeholder="Type a command (e.g. uploads, background, invite, status)..." style="width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:13.5px;color:#0f172a;background:#ffffff;"></div>
      <div id="vtb-cmd-list" style="padding:8px;max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;"></div>
    `;
    bd.appendChild(box);
    document.body.appendChild(bd);
    const inp = box.querySelector('#vtb-cmd-in');
    const list = box.querySelector('#vtb-cmd-list');
    const draw = (q = '') => {
      list.innerHTML = '';
      actions.filter((a) => a.label.toLowerCase().includes(q.toLowerCase())).forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = a.label;
        btn.style.cssText = 'text-align:left;padding:10px 14px;border-radius:12px;border:1px solid #e2e8f0;background:#ffffff;color:#0f172a!important;font-weight:700;font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer;';
        btn.onmouseenter = () => { btn.style.background = '#eff6ff'; btn.style.borderColor = '#93c5fd'; };
        btn.onmouseleave = () => { btn.style.background = '#ffffff'; btn.style.borderColor = '#e2e8f0'; };
        btn.onclick = () => { closeUnifiedModal(); a.fn(); };
        list.appendChild(btn);
      });
      fixButtonColors(box);
    };
    draw();
    inp.oninput = () => draw(inp.value);
    inp.focus();
  }

  /* ---------- Lazy Firebase Auth + Firestore Connector (Zero Startup Blocking) ---------- */
  async function initCloudAccountSync() {
    try {
      const cfg = await fetch('/firebase-applet-config.json').then((r) => r.json());
      const [appMod, authMod, fsMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
      ]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
      const auth = authMod.getAuth(app);
      fbDb = cfg.firestoreDatabaseId ? fsMod.getFirestore(app, cfg.firestoreDatabaseId) : fsMod.getFirestore(app);
      fbMod = fsMod;
      authMod.onAuthStateChanged(auth, (user) => hydrateFromCloud(user));
    } catch (err) {
      console.warn('[VTB Pro] Running in fast offline mode:', err);
    }
  }

  /* ---------- Boot Immediately (0ms Button Paint) ---------- */
  let domTimer = null;
  let lastBoardId = '';
  function onDomChange() {
    clearTimeout(domTimer);
    domTimer = setTimeout(() => {
      stripFirebaseAutoSyncText();
      mountSettingsSubBar();
      enhanceSleepModeModal();
      const bId = getCurrentBoardInfo().id;
      if (bId !== lastBoardId) { lastBoardId = bId; applyBoardTheme(); }
    }, 80);
  }

  function boot() {
    applyBoardTheme();
    mountSettingsSubBar();
    stripFirebaseAutoSyncText();
    enhanceSleepModeModal();

    const obs = new MutationObserver(onDomChange);
    obs.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); }
      if (e.key === 'Escape') closeUnifiedModal();
    });

    ['mousemove', 'keydown', 'click', 'touchstart'].forEach((ev) =>
      window.addEventListener(ev, () => { lastActivityAt = Date.now(); }, { passive: true })
    );

    // Expose globally so any custom button can trigger tabs directly
    window.VTBPro = { openModal: openUnifiedModal, openCommandPalette, toggleFocusTimer };

    // Connect Firebase Auth/Firestore asynchronously after UI is already interactive
    setTimeout(initCloudAccountSync, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
