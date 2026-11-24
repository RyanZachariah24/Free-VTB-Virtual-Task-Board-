import {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, onSnapshot, arrayUnion, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import {
  generateBoardKey, wrapBoardKeyForUser, unwrapBoardKey,
  encryptPayload, decryptPayload,
} from "./cryptoVault";

// Subscribe to ALL boards the current user owns OR has been invited to
export function subscribeToUserBoards(uid, onBoards) {
  const q = query(collection(db, "boards"), where("memberIds", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const boards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onBoards(boards);
  });
}

export async function createBoard(boardName, ownerPublicKeyB64, isShared = false) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in required.");

  const boardKey = await generateBoardKey();
  const wrapped = await wrapBoardKeyForUser(boardKey, ownerPublicKeyB64);

  const ref = await addDoc(collection(db, "boards"), {
    name: boardName,
    ownerId: uid,
    isShared,
    memberIds: [uid],
    encryptedKeys: { [uid]: wrapped },
    background: null,
    createdAt: serverTimestamp(),
  });

  return { boardId: ref.id, boardKey };
}

// Invite another user by email -> adds their UID to memberIds + wraps boardKey for them
export async function inviteUserToBoard(boardId, boardKey, teammateEmail) {
  const cleanEmail = teammateEmail.toLowerCase().trim();
  const q = query(collection(db, "users"), where("email", "==", cleanEmail));
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error("That user has not signed in and initialized their VTB vault yet.");
  }

  const teammateDoc = snap.docs[0];
  const teammateUid = teammateDoc.id;
  const teammatePubKey = teammateDoc.data().publicKey;
  const wrappedForTeammate = await wrapBoardKeyForUser(boardKey, teammatePubKey);

  await updateDoc(doc(db, "boards", boardId), {
    isShared: true,
    memberIds: arrayUnion(teammateUid),
    [`encryptedKeys.${teammateUid}`]: wrappedForTeammate,
  });
}

export async function loadBoardKey(boardId, userPrivateKey) {
  const uid = auth.currentUser?.uid;
  const snap = await getDoc(doc(db, "boards", boardId));
  if (!snap.exists()) throw new Error("Board not found.");
  const wrapped = snap.data().encryptedKeys?.[uid];
  if (!wrapped) throw new Error("Access denied: no board key for this account.");
  return unwrapBoardKey(wrapped, userPrivateKey);
}

export async function saveTask(boardId, boardKey, taskObj) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in required to save tasks.");
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

export async function deleteTask(boardId, taskId) {
  await deleteDoc(doc(db, "boards", boardId, "tasks", taskId));
}

export function subscribeToBoardTasks(boardId, boardKey, onTasks, onError) {
  return onSnapshot(
    collection(db, "boards", boardId, "tasks"),
    async (snap) => {
      try {
        const tasks = await Promise.all(
          snap.docs.map(async (d) => {
            const plain = await decryptPayload(boardKey, d.data());
            return { ...plain, id: d.id };
          })
        );
        onTasks(tasks);
      } catch (err) {
        onError?.(err);
      }
    },
    (err) => onError?.(err)
  );
}
