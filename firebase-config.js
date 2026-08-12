// Bu dosyayı kendi Firebase proje bilgilerinle doldur.
// Nereden alınacağı README.md içinde "Firebase Kurulumu" bölümünde anlatılıyor.
// Kısaca: https://console.firebase.google.com → Proje oluştur → Web uygulaması ekle (</>)
// → "Firebase SDK snippet" içindeki firebaseConfig nesnesini aşağıya kopyala.

const firebaseConfig = {
  apiKey: "AIzaSyBRRklQ0c7vBWtkukO2mDXdoObjGXIlsnM",
  authDomain: "karalistok.firebaseapp.com",
  projectId: "karalistok",
  storageBucket: "karalistok.firebasestorage.app",
  messagingSenderId: "763355638823",
  appId: "1:763355638823:web:e9186733ccf1836314f202"
  measurementId: "G-W9B1B4Z2SB"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
