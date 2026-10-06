// Firebase yapılandırma bilgileri — kendi proje değerlerinle doldur.
// Nereden alınır: https://console.firebase.google.com
//   → Proje oluştur → Web uygulaması ekle (</>)
//   → "Firebase SDK snippet" → firebaseConfig'i buraya kopyala.

const firebaseConfig = {
  apiKey:            "AIzaSyBRRklQ0c7vBWtkukO2mDXdoObjGXIlsnM",
  authDomain:        "karalistok.firebaseapp.com",
  projectId:         "karalistok",
  storageBucket:     "karalistok.firebasestorage.app",
  messagingSenderId: "763355638823",
  appId:             "1:763355638823:web:e9186733ccf1836314f202",
  measurementId:     "G-W9B1B4Z2SB",
};

// ---- Bu satırların altına dokunmana gerek yok ----
window.auth    = null;
window.db      = null;
window.storage = null;  // ← Yeni: Firebase Storage (çoklu görsel)
window.firebaseSetupError = null;

const stillPlaceholder = Object.values(firebaseConfig).some(v => String(v).startsWith('BURAYA_'));

if (typeof firebase === 'undefined') {
  window.firebaseSetupError =
    'Firebase kütüphanesi yüklenemedi. İnternet bağlantını kontrol et; ' +
    'şirket/okul ağı veya reklam engelleyici gstatic.com adresini engelliyor olabilir.';

} else if (stillPlaceholder) {
  window.firebaseSetupError =
    'firebase-config.js dosyası hâlâ örnek (BURAYA_...) değerlerle duruyor. ' +
    'README.md → "Firebase Kurulumu" adımlarını izleyip kendi Firebase proje bilgilerini buraya yapıştır.';

} else {
  try {
    firebase.initializeApp(firebaseConfig);
    window.auth    = firebase.auth();
    window.db      = firebase.firestore();
    window.storage = firebase.storage(); // ← Storage başlatıldı

    // Firestore çevrimdışı kalıcılık (isteğe bağlı)
    // window.db.enablePersistence().catch(() => {});

  } catch (err) {
    console.error('Firebase başlatma hatası:', err);
    window.firebaseSetupError =
      'Firebase başlatılamadı: ' + err.message +
      ' — firebase-config.js içindeki bilgileri Firebase Console\'daki değerlerle karşılaştır.';
  }
}

// ============================================================
// Firebase Storage Kurulum Notu
// ============================================================
// Çoklu görsel yüklemek için Firebase Storage'ı etkinleştirmen gerekiyor:
//
// 1. https://console.firebase.google.com → Projen → Build → Storage
// 2. "Get started" → Production mode → Konum seç (ör. europe-west1)
// 3. Storage Rules'u aşağıdaki gibi güncelle (authenticated kullanıcılar):
//
//    rules_version = '2';
//    service firebase.storage {
//      match /b/{bucket}/o {
//        match /products/{allPaths=**} {
//          allow read, write: if request.auth != null;
//        }
//      }
//    }
//
// Storage kurulmadan da site çalışır — görseller base64 olarak
// Firestore'a kaydedilir (eski davranış, max ~5 görsel).
// ============================================================
