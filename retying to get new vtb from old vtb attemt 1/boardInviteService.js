import {
  collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs,
  query, where, onSnapshot, arrayUnion, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  generateBoardKey, wrapBoardKeyForUser, unwrapBoardKey,
  encryptPayload, decryptPayload,
} from "./cryptoVault";

// Helper: export raw AES key to base64 & wrap with a one-time invite secret
async function wrapKeyWithInviteSecret(boardKey, secretStr) {
  const raw = await crypto.subtle.exportKey("raw", boardKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secretStr), "PBKDF2", false, ["deriveKey"]
  );
  const aes = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, raw);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { salt: b64(salt), iv: b64(iv), ciphertext: b64(cipher) };
}

async function unwrapKeyWithInviteSecret(encObj, secretStr) {
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secretStr), "PBKDF2", false, ["deriveKey"]
  );
  const aes = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(encObj.salt), iterations: 100000, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(encObj.iv) }, aes, fromB64(encObj.ciphertext)
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// 1. Send Shared Board Invite (works for existing OR new accounts + sends EmailJS)
export async function sendSharedBoardInvite({
  boardId,
  boardName,
  boardKey,
  teammateEmail,
  emailjsConfig,
}) {
  const sender = auth.currentUser;
  if (!sender) throw new Error("You must sign in first.");
  const toEmail = teammateEmail.toLowerCase().trim();

  // Check if teammate already has a VTB user profile
  const userQ = query(collection(db, "users"), where("email", "==", toEmail));
  const userSnap = await getDocs(userQ);

  let inviteLink = window.location.origin;

  if (!userSnap.empty) {
    // Existing account: grant immediate encrypted access + in-app notification
    const teammateDoc = userSnap.docs[0];
    const teammateUid = teammateDoc.id;
    const teammatePubKey = teammateDoc.data().publicKey;
    const wrappedForTeammate = await wrapBoardKeyForUser(boardKey, teammatePubKey);

    await updateDoc(doc(db, "boards", boardId), {
      isShared: true,
      memberIds: arrayUnion(teammateUid),
      [`encryptedKeys.${teammateUid}`]: wrappedForTeammate,
    });

    await addDoc(collection(db, "users", teammateUid, "notifications"), {
      type: "board_invite",
      boardId,
      boardName,
      fromEmail: sender.email,
      status: "accepted",
      message: `${sender.email} shared board "${boardName}" with you.`,
      createdAt: serverTimestamp(),
      read: false,
    });

    inviteLink = `${window.location.origin}/?board=${boardId}`;
  } else {
    // New account (hasn't logged in yet): create zero-knowledge invite with #secret in URL hash
    const randomBytes = crypto.getRandomValues(new Uint8Array(24));
    const inviteSecret = btoa(String.fromCharCode(...randomBytes));
    const wrappedWithSecret = await wrapKeyWithInviteSecret(boardKey, inviteSecret);

    const inviteRef = await addDoc(collection(db, "invites"), {
      boardId,
      boardName,
      fromUid: sender.uid,
      fromEmail: (sender.email || "").toLowerCase(),
      toEmail,
      wrappedBoardKey: wrappedWithSecret,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    inviteLink = `${window.location.origin}/?invite=${inviteRef.id}#secret=${encodeURIComponent(inviteSecret)}`;
  }

  // Send Email via EmailJS if configured
  if (emailjsConfig?.publicKey && emailjsConfig?.serviceId && emailjsConfig?.templateId && window.emailjs) {
    window.emailjs.init(emailjsConfig.publicKey);
    await window.emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
      to_email: toEmail,
      from_email: sender.email,
      board_name: boardName,
      invite_link: inviteLink,
      message: `${sender.email} invited you to collaborate on VTB board "${boardName}". Open: ${inviteLink}`,
    });
  }

  return { inviteLink, directAccessGranted: !userSnap.empty };
}

// 2. Accept Invite When Account B Opens Invite Link
export async function acceptInviteFromUrl(userPublicKeyB64) {
  const params = new URLSearchParams(window.location.search);
  const inviteId = params.get("invite");
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const secret = hashParams.get("secret");

  if (!inviteId || !secret || !auth.currentUser) return null;

  const inviteSnap = await getDoc(doc(db, "invites", inviteId));
  if (!inviteSnap.exists()) throw new Error("Invite not found.");
  const inv = inviteSnap.data();

  if (inv.toEmail !== (auth.currentUser.email || "").toLowerCase()) {
    throw new Error(`This invite was sent to ${inv.toEmail}. Sign in with that account.`);
  }

  const boardKey = await unwrapKeyWithInviteSecret(inv.wrappedBoardKey, secret);
  const wrappedForMe = await wrapBoardKeyForUser(boardKey, userPublicKeyB64);

  await updateDoc(doc(db, "boards", inv.boardId), {
    isShared: true,
    memberIds: arrayUnion(auth.currentUser.uid),
    [`encryptedKeys.${auth.currentUser.uid}`]: wrappedForMe,
  });

  await updateDoc(doc(db, "invites", inviteId), { status: "accepted" });

  // Clean secret from URL bar
  window.history.replaceState({}, document.title, `/?board=${inv.boardId}`);
  return inv.boardId;
}

// 3. Save Task (Throws visible error instead of failing silently)
export async function saveBoardTask(boardId, boardKey, taskObj) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Please sign in first (Guest mode does not save to cloud).");
  if (!boardId || !boardKey) throw new Error("Board key not unlocked.");

  const encrypted = await encryptPayload(boardKey, taskObj);
  if (taskObj.id) {
    await setDoc(
      doc(db, "boards", boardId, "tasks", taskObj.id),
      { ...encrypted, updatedAt: serverTimestamp(), updatedBy: uid },
      { merge: true }
    );
    return taskObj.id;
  } else {
    const ref = await addDoc(collection(db, "boards", boardId, "tasks"), {
      ...encrypted,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    return ref.id;
  }
}

// 4. Real-time sync for ALL members across ALL devices
export function subscribeToBoardTasks(boardId, boardKey, onTasks, onError) {
  return onSnapshot(
    collection(db, "boards", boardId, "tasks"),
    async (snap) => {
      try {
        const tasks = await Promise.all(
          snap.docs.map(async (d) => ({ ...(await decryptPayload(boardKey, d.data())), id: d.id }))
        );
        onTasks(tasks);
      } catch (err) {
        onError?.(err);
      }
    },
    (err) => onError?.(err)
  );
}
