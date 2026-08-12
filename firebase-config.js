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
  appId: "1:763355638823:web:e9186733ccf1836314f202",
  measurementId: "G-W9B1B4Z2SB"
};

// ---- Bu satırların altına dokunmana gerek yok ----
window.auth = null;
window.db = null;
window.firebaseSetupError = null;

const stillPlaceholder = Object.values(firebaseConfig).some(v => String(v).startsWith('BURAYA_'));

if(typeof firebase === 'undefined'){
  window.firebaseSetupError = 'Firebase kütüphanesi yüklenemedi. İnternet bağlantını kontrol et; şirket/okul ağı veya reklam engelleyici gstatic.com adresini engelliyor olabilir.';
} else if(stillPlaceholder){
  window.firebaseSetupError = 'firebase-config.js dosyası hâlâ örnek (BURAYA_...) değerlerle duruyor. README.md → "Firebase Kurulumu" adımlarını izleyip kendi Firebase proje bilgilerini buraya yapıştırman gerekiyor.';
} else {
  try{
    firebase.initializeApp(firebaseConfig);
    window.auth = firebase.auth();
    window.db = firebase.firestore();
  }catch(err){
    console.error('Firebase başlatma hatası:', err);
    window.firebaseSetupError = 'Firebase başlatılamadı: ' + err.message + ' — firebase-config.js içindeki bilgileri Firebase Console\'daki değerlerle karşılaştır.';
  }
}
