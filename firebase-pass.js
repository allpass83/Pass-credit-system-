// firebase-pass.js
// 請把 Firebase Console 提供的 firebaseConfig 貼到下面。

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "貼上你的 apiKey",
  authDomain: "貼上你的 authDomain",
  projectId: "貼上你的 projectId",
  storageBucket: "貼上你的 storageBucket",
  messagingSenderId: "貼上你的 messagingSenderId",
  appId: "貼上你的 appId"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function passRegister(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

async function passLogin(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

async function passLogout() {
  await signOut(auth);
}

async function savePassData(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("尚未登入，無法儲存資料");
  await setDoc(
    doc(db, "users", user.uid, "pass", "main"),
    {
      email: user.email,
      updatedAt: serverTimestamp(),
      data
    },
    { merge: true }
  );
}

async function loadPassData() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, "users", user.uid, "pass", "main"));
  if (!snap.exists()) return null;
  return snap.data().data || null;
}

function watchPassAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

window.PASSFirebase = {
  auth,
  passRegister,
  passLogin,
  passLogout,
  savePassData,
  loadPassData,
  watchPassAuth
};
