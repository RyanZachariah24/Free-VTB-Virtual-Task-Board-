import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  generateUserKeyPair,
  exportPublicKey,
  encryptPrivateKey,
  decryptPrivateKey,
} from "./cryptoVault";

// Call after Google OR VTB email login to unlock or initialize user's zero-knowledge keypair
export async function initializeOrUnlockVault(vaultPassphrase) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const userRef = doc(db, "users", user.uid);
  const vaultRef = doc(db, "users", user.uid, "private", "vault");
  const vaultSnap = await getDoc(vaultRef);

  if (!vaultSnap.exists()) {
    // First-time user: generate RSA keypair & save encrypted private key in cloud
    const pair = await generateUserKeyPair();
    const pubB64 = await exportPublicKey(pair.publicKey);
    const encPriv = await encryptPrivateKey(pair.privateKey, vaultPassphrase);

    await setDoc(userRef, {
      email: (user.email || "").toLowerCase(),
      displayName: user.displayName || user.email?.split("@")[0] || "VTB User",
      publicKey: pubB64,
    }, { merge: true });

    await setDoc(vaultRef, encPriv);
    return { privateKey: pair.privateKey, publicKey: pubB64 };
  }

  // Returning user on ANY device: decrypt their private key with their vault passphrase
  const userSnap = await getDoc(userRef);
  const privateKey = await decryptPrivateKey(vaultSnap.data(), vaultPassphrase);
  return { privateKey, publicKey: userSnap.data().publicKey };
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

// VTB Account MUST use Firebase Auth so Firestore syncs across devices & accounts
export async function signUpVtbAccount(email, password) {
  return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInVtbAccount(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function logoutVtb() {
  return signOut(auth);
}
