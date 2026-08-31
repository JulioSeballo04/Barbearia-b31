import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut, onAuthStateChanged, deleteUser
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField,
  collection, getDocs, query, where, documentId, runTransaction, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Reexportado pra todo o resto do app importar só daqui, em vez de cada
// módulo apontar direto pro CDN do Firebase.
export {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser,
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField,
  collection, getDocs, query, where, documentId, runTransaction, onSnapshot
};

var firebaseConfig = {
  apiKey: "AIzaSyBQackc8mx0J6oYFwrMQsQTPNTHbDCCmYo",
  authDomain: "barbearia-b31.firebaseapp.com",
  projectId: "barbearia-b31",
  storageBucket: "barbearia-b31.firebasestorage.app",
  messagingSenderId: "590732661441",
  appId: "1:590732661441:web:ef83bfd6f455d6f9503a40"
};
export var fbApp = initializeApp(firebaseConfig);
export var auth = getAuth(fbApp);
export var db = getFirestore(fbApp);
export var googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
