# 🧱 Karali Depo — Stok Kontrol

Lego tuğlası temalı, e-posta/şifre ile korunan stok takip uygulaması. Verileri **Firebase (Google)** üzerinde tutar, bu sayede telefondan girsen de bilgisayardan girsen de **aynı ürün listesini** görürsün — hesabı olan herkes anında güncellenen ortak depoya erişir.

## Özellikler
- E-posta + şifre ile **kayıt ol / giriş yap** ekranı — sadece hesabı olanlar depoya erişir
- Girdiğin veriler bulutta (Firestore) tutulur → **telefon ve bilgisayarda aynı anda, gerçek zamanlı** senkron
- Ürün ekleme / düzenleme / silme, her ürüne **fotoğraf** ekleme
- Stok adedi, minimum stok seviyesi, kategori, birim fiyat takibi, hızlı +/- butonları
- Duruma göre otomatik renklendirme: **Stokta** (yeşil) · **Azalıyor** (sarı) · **Tükendi** (kırmızı)
- Arama, kategori ve durum filtreleri; üst panelde özet istatistikler
- Telefonda **"Ana Ekrana Ekle"** ile gerçek bir uygulama gibi simgeyle açılır (PWA)
- JSON olarak yedek alma / yedekten toplu geri yükleme

## 1) Firebase Kurulumu (ücretsiz, ~5 dakika)

Uygulamanın telefon/bilgisayar arasında senkron çalışması ve giriş sistemi için ücretsiz bir Firebase projesi kurman gerekiyor.

1. **Proje oluştur:** [console.firebase.google.com](https://console.firebase.google.com) adresine git, Google hesabınla gir, **"Proje ekle"** ile yeni bir proje oluştur (isim: örn. `karali-depo`).
2. **Web uygulaması ekle:** Proje ana sayfasında `</>` (Web) simgesine tıkla, bir takma ad ver (örn. `karali-depo-web`), **Firebase Hosting'i işaretleme** (gerekmiyor), "Kaydet"e tıkla.
3. Karşına çıkan `firebaseConfig` nesnesini kopyala — şuna benzer:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "karali-depo.firebaseapp.com",
     projectId: "karali-depo",
     storageBucket: "karali-depo.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```
4. Bu değerleri proje klasöründeki **`firebase-config.js`** dosyasını açıp `BURAYA_...` yazan yerlere yapıştır.
5. **Kimlik doğrulamayı aç:** Sol menüden **Build → Authentication → Get started**, "Sign-in method" sekmesinden **E-posta/Şifre**'yi etkinleştir.
6. **Veritabanını oluştur:** Sol menüden **Build → Firestore Database → Create database**. Konum seç (örn. `eur3 (europe-west)`), "Start in **test mode**" seçeneğiyle başlat (aşağıdaki güvenlik kurallarını sonra ekleyeceğiz).
7. **Güvenlik kuralları:** Firestore → **Rules** sekmesine git, aşağıdaki kurallarla değiştir ve **Yayınla**'ya tıkla — böylece sadece giriş yapmış kullanıcılar veriye erişebilir:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /products/{productId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

Bu kadar! Artık `firebase-config.js` doldurulmuş haliyle GitHub'a yükleyip yayınlayabilirsin — kayıt olan herkes aynı ortak stok listesini görür ve düzenleyebilir.

> **Not:** `firebase-config.js` içindeki bilgiler gizli bir "şifre" değildir, tarayıcıda herkese görünür durur — bu normaldir. Gerçek koruma yukarıdaki **Firestore güvenlik kuralları** ile sağlanır (sadece giriş yapanlar okuyup yazabilir).

## 2) Çalıştırma / Yayınlama

### GitHub Pages ile yayınla
1. Bu klasördeki tüm dosyaları (`index.html`, `style.css`, `script.js`, `firebase-config.js`, `manifest.json`, `icons/`) bir GitHub reposuna yükle.
2. Repo **Settings → Pages** → Branch: `main`, klasör: `/ (root)` → Kaydet.
3. Birkaç dakika sonra `https://kullanici-adin.github.io/repo-adi/` adresinden erişilebilir.

⚠️ Firebase Authentication'da açık kalan domain listesine bu adresi eklemen gerekebilir: **Authentication → Settings → Authorized domains → Add domain**.

### Yerelde test etmek için
```bash
python3 -m http.server 8000
```
sonra `http://localhost:8000` adresini aç (Firebase login için `localhost` zaten izinli domain listesinde gelir).

## 3) Telefonda "Ana Ekrana Ekle"

**iPhone (Safari):** Siteyi aç → paylaş simgesi (□↑) → **"Ana Ekrana Ekle"**.
**Android (Chrome):** Siteyi aç → sağ üst ⋮ menüsü → **"Ana ekrana ekle"** / **"Uygulama yükle"**.

Karali Depo simgesiyle ve tam ekran olarak, normal bir uygulama gibi açılır.

## Hesaplar ve veri paylaşımı

Kayıt olan her kullanıcı **aynı ortak ürün listesine** erişir — yani mağaza/depo ekibindeki herkes kendi hesabıyla giriş yapıp aynı stok verisini görüp güncelleyebilir. Kişiye özel ayrı depo istiyorsan (her kullanıcı sadece kendi ürünlerini görsün), haber ver, o mantığa göre uyarlayabiliriz.

## Dosya yapısı
```
lego-stok/
├── index.html          → sayfa yapısı + giriş ekranı
├── style.css            → Lego tuğlası temalı görsel tasarım
├── script.js             → giriş, stok mantığı, Firestore senkron
├── firebase-config.js    → kendi Firebase bilgilerini buraya yapıştırırsın
├── manifest.json         → "ana ekrana ekle" ayarları
├── icons/                → uygulama simgeleri (logo)
└── README.md             → bu dosya
```
