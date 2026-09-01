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

// ATENÇÃO — esta é a branch "teste": aponta pro projeto Firebase separado
// (barbearia-b31-teste), com seu próprio Firestore/Auth, pra dar pra testar
// mudanças sem mexer em nenhum dado real de cliente. A branch "main" tem o
// firebaseConfig de produção — nunca faça merge desta config pra lá.
var firebaseConfig = {
  apiKey: "AIzaSyCFDkhp5gfh1AjtAWIch_D9tZjVUs_EZUQ",
  authDomain: "barbearia-b31-teste.firebaseapp.com",
  projectId: "barbearia-b31-teste",
  storageBucket: "barbearia-b31-teste.firebasestorage.app",
  messagingSenderId: "413712109910",
  appId: "1:413712109910:web:f8b482bfd14ccc908386f7"
};
export var fbApp = initializeApp(firebaseConfig);
export var auth = getAuth(fbApp);
export var db = getFirestore(fbApp);
export var googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
