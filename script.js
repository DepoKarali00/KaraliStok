// =========================================================
// Karali Depo — Stok Kontrol v2.0
// Yenilikler:
//  • Optimistik +/- güncelleme (anında UI, arka planda Firestore)
//  • Çoklu görsel — Firebase Storage (büyük resimler) veya
//    base64 fallback (Storage yoksa)
//  • Resim galerisi + lightbox
//  • Stok geçmişi (Firestore alt koleksiyonu)
//  • Notlar / açıklama alanı
//  • CSV + JSON export
//  • Sıralama & grid/liste görünümü
//  • Düşük / tükenen stok uyarı bandı
// =========================================================

// Firebase kurulum hatası varsa, çökmek yerine ekranda göster
if (window.firebaseSetupError) {
  document.addEventListener('DOMContentLoaded', showSetupError);
  if (document.readyState !== 'loading') showSetupError();
}

function showSetupError() {
  const overlay = document.getElementById('authOverlay');
  const modal = overlay.querySelector('.auth-modal');
  modal.innerHTML = `
    <div class="auth-logo"><img src="icons/icon-192.png" alt="Karali Depo"></div>
    <h2>Kurulum tamamlanmadı</h2>
    <p class="auth-subtitle" style="margin-bottom:0;">${escapeHtml(window.firebaseSetupError)}</p>
  `;
  overlay.hidden = false;
}

const auth = window.auth;
const db = window.db;
const storage = window.storage; // Firebase Storage (firebase-config.js'de tanımlı)

let products = [];
let unsubscribeProducts = null;
let currentView = 'grid'; // 'grid' | 'list'

const PRODUCTS_COL = 'products';
const HISTORY_COL = 'history';

// Lightbox durumu
let lightboxImages = [];
let lightboxIndex = 0;

// Bekleyen debounced qty yazmaları (rapid click batching)
const pendingQtyUpdates = {};

// ---------- DOM referansları ----------
const authOverlay   = document.getElementById('authOverlay');
const authForm      = document.getElementById('authForm');
const authTitle     = document.getElementById('authTitle');
const authSubtitle  = document.getElementById('authSubtitle');
const authEmail     = document.getElementById('authEmail');
const authPassword  = document.getElementById('authPassword');
const authError     = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
const appRoot       = document.getElementById('appRoot');
const userEmailLabel = document.getElementById('userEmailLabel');
const logoutBtn     = document.getElementById('logoutBtn');
const grid          = document.getElementById('grid');
const emptyState    = document.getElementById('emptyState');
const searchInput   = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const statusFilter  = document.getElementById('statusFilter');
const sortSelect    = document.getElementById('sortSelect');
const modalOverlay  = document.getElementById('modalOverlay');
const productForm   = document.getElementById('productForm');
const modalTitle    = document.getElementById('modalTitle');
const categoryList  = document.getElementById('categoryList');
const alertBanner   = document.getElementById('alertBanner');

let authMode = 'login'; // 'login' | 'register'

// ============================================================
// KİMLİK DOĞRULAMA
// ============================================================
authToggleBtn.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  updateAuthUI();
});

function updateAuthUI() {
  authError.hidden = true;
  if (authMode === 'login') {
    authTitle.textContent = 'Giriş Yap';
    authSubtitle.textContent = "Karali Depo'ya erişmek için giriş yap.";
    authSubmitBtn.textContent = 'Giriş Yap';
    authToggleBtn.textContent = 'Hesabın yok mu? Kayıt ol';
    authPassword.setAttribute('autocomplete', 'current-password');
  } else {
    authTitle.textContent = 'Kayıt Ol';
    authSubtitle.textContent = 'E-posta ve şifre ile yeni hesap oluştur.';
    authSubmitBtn.textContent = 'Kayıt Ol';
    authToggleBtn.textContent = 'Zaten hesabın var mı? Giriş yap';
    authPassword.setAttribute('autocomplete', 'new-password');
  }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.hidden = true;
  if (!auth) {
    authError.textContent = window.firebaseSetupError || 'Firebase kurulumu tamamlanmadı.';
    authError.hidden = false;
    return;
  }
  const email = authEmail.value.trim();
  const password = authPassword.value;
  authSubmitBtn.disabled = true;
  try {
    if (authMode === 'login') {
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
    }
  } catch (err) {
    authError.textContent = translateAuthError(err);
    authError.hidden = false;
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

function translateAuthError(err) {
  const map = {
    'auth/invalid-email':          'Geçersiz e-posta adresi.',
    'auth/user-not-found':         'Bu e-posta ile kayıtlı hesap bulunamadı.',
    'auth/wrong-password':         'Şifre hatalı.',
    'auth/invalid-credential':     'E-posta veya şifre hatalı.',
    'auth/email-already-in-use':   'Bu e-posta zaten kayıtlı — giriş yapmayı dene.',
    'auth/weak-password':          'Şifre en az 6 karakter olmalı.',
    'auth/network-request-failed': 'Bağlantı hatası — internetini kontrol et.',
    'auth/invalid-api-key':        'Firebase API anahtarı geçersiz.',
    'auth/configuration-not-found':'Firebase yapılandırması eksik.',
    'auth/unauthorized-domain':    'Bu domain Firebase\'de yetkili değil.',
  };
  return map[err.code] || ('Hata: ' + err.message);
}

if (auth) {
  auth.onAuthStateChanged((user) => {
    if (user) {
      authOverlay.hidden = true;
      appRoot.hidden = false;
      userEmailLabel.textContent = user.email;
      attachProductsListener();
    } else {
      appRoot.hidden = true;
      authOverlay.hidden = false;
      if (unsubscribeProducts) { unsubscribeProducts(); unsubscribeProducts = null; }
      products = [];
    }
  });
}

// ============================================================
// FİRESTORE DİNLEYİCİ
// ============================================================
function attachProductsListener(force) {
  if (unsubscribeProducts && !force) return;
  if (unsubscribeProducts) { unsubscribeProducts(); unsubscribeProducts = null; }
  unsubscribeProducts = db.collection(PRODUCTS_COL)
    .orderBy('name')
    .onSnapshot(
      (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        render();
      },
      (err) => {
        console.error('Firestore okuma hatası:', err);
        showToast('Veriler yüklenemedi — Firestore kurulumunu kontrol et.');
      }
    );
}

// Sekme öne gelince / internet gelince bağlantıyı tazele
function refreshIfLoggedIn() {
  if (auth && auth.currentUser) attachProductsListener(true);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshIfLoggedIn();
});
window.addEventListener('focus', refreshIfLoggedIn);
window.addEventListener('online', refreshIfLoggedIn);

// ============================================================
// FİRESTORE CRUD
// ============================================================
async function addProductToDb(data) {
  return db.collection(PRODUCTS_COL).add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateProductInDb(id, data) {
  await db.collection(PRODUCTS_COL).doc(id).update({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteProductFromDb(id) {
  await db.collection(PRODUCTS_COL).doc(id).delete();
}

async function logHistory(productId, productName, delta, newQty) {
  try {
    await db.collection(PRODUCTS_COL).doc(productId)
      .collection(HISTORY_COL).add({
        delta,
        newQty,
        productName,
        user: auth.currentUser ? auth.currentUser.email : 'bilinmiyor',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
  } catch (e) {
    console.warn('Geçmiş kaydedilemedi:', e);
  }
}

// ============================================================
// DURUM HESAPLAMA
// ============================================================
function getStatus(p) {
  if (p.qty <= 0) return 'out';
  if (p.qty <= p.min) return 'low';
  return 'ok';
}
const statusLabel = { ok: 'Stokta', low: 'Azalıyor', out: 'Tükendi' };

function getProductImages(p) {
  if (p.images && p.images.length > 0) return p.images;
  if (p.image) return [p.image]; // Geriye dönük uyumluluk
  return [];
}

// ============================================================
// RENDER
// ============================================================
function render() {
  // Kategori listesini güncelle
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const prevCat = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">Tüm kategoriler</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  categoryFilter.value = cats.includes(prevCat) ? prevCat : '';
  categoryList.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');

  const q     = searchInput.value.trim().toLowerCase();
  const catF  = categoryFilter.value;
  const statF = statusFilter.value;

  const filtered = products.filter(p => {
    const matchQ   = !q || p.name.toLowerCase().includes(q) ||
                     (p.sku || '').toLowerCase().includes(q) ||
                     (p.notes || '').toLowerCase().includes(q);
    const matchCat  = !catF  || p.category === catF;
    const matchStat = !statF || getStatus(p) === statF;
    return matchQ && matchCat && matchStat;
  });

  // Sırala
  const sv = sortSelect.value;
  filtered.sort((a, b) => {
    if (sv === 'name')       return a.name.localeCompare(b.name, 'tr');
    if (sv === 'qty-asc')    return Number(a.qty || 0) - Number(b.qty || 0);
    if (sv === 'qty-desc')   return Number(b.qty || 0) - Number(a.qty || 0);
    if (sv === 'price-desc') return Number(b.price || 0) - Number(a.price || 0);
    const ord = { out: 0, low: 1, ok: 2 };
    return ord[getStatus(a)] - ord[getStatus(b)] || a.name.localeCompare(b.name, 'tr');
  });

  grid.innerHTML = '';
  grid.className = 'grid' + (currentView === 'list' ? ' grid-list' : '');
  emptyState.hidden = products.length !== 0;

  if (products.length && filtered.length === 0) {
    grid.innerHTML = `<p class="no-results">Aramanla eşleşen ürün yok.</p>`;
  }

  filtered.forEach(p => grid.appendChild(renderCard(p)));
  updateStats();
  updateAlertBanner();
}

function renderCard(p) {
  const status = getStatus(p);
  const images = getProductImages(p);
  const mainImg = images[0] || null;

  const card = document.createElement('div');
  card.className = `brick product-brick status-${status}`;
  card.dataset.id = p.id;

  card.innerHTML = `
    <div class="studs"><span></span><span></span><span></span></div>
    <div class="brick-face">

      <div class="p-top">
        <div class="p-thumb-wrap ${mainImg ? 'has-image' : ''}">
          ${mainImg
            ? `<img src="${mainImg}" alt="${escapeHtml(p.name)}" class="p-thumb-img">`
            : `<div class="p-thumb-placeholder">🧱</div>`}
          ${images.length > 1 ? `<span class="img-count">+${images.length - 1}</span>` : ''}
        </div>
        <div class="p-info">
          <div class="p-name">${escapeHtml(p.name)}</div>
          ${p.sku ? `<div class="p-sku">${escapeHtml(p.sku)}</div>` : ''}
          ${p.category ? `<span class="p-cat">${escapeHtml(p.category)}</span>` : ''}
        </div>
        <span class="p-badge badge-${status}">${statusLabel[status]}</span>
      </div>

      ${p.notes ? `<div class="p-notes">${escapeHtml(p.notes)}</div>` : ''}

      <div class="p-qty-row">
        <div class="qty-controls">
          <button class="qty-btn qty-dec" data-action="dec" aria-label="Azalt">−</button>
          <span class="qty-num">${p.qty}</span>
          <button class="qty-btn qty-inc" data-action="inc" aria-label="Artır">+</button>
        </div>
        <span class="p-min">min: ${p.min}</span>
      </div>

      ${p.price ? `<div class="p-price">₺${Number(p.price).toFixed(2)} · Toplam: ₺${(p.price * p.qty).toFixed(2)}</div>` : ''}

      <div class="p-actions">
        <button data-action="history" class="btn-action" title="Stok hareketi">📋</button>
        <button data-action="edit"    class="btn-action">Düzenle</button>
        <button data-action="delete"  class="btn-action danger">Sil</button>
      </div>

    </div>
  `;

  // Fotoğraf → lightbox
  const thumbImg = card.querySelector('.p-thumb-img');
  if (thumbImg) {
    thumbImg.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(images, 0); });
  }

  // +/- butonları — optimistik güncelleme
  card.querySelector('[data-action="inc"]').addEventListener('click', (e) => { e.stopPropagation(); changeQty(p, 1); });
  card.querySelector('[data-action="dec"]').addEventListener('click', (e) => { e.stopPropagation(); changeQty(p, -1); });
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(p));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProduct(p));
  card.querySelector('[data-action="history"]').addEventListener('click', () => openHistory(p));

  return card;
}

// Büyük sayıları kısa biçimde göster: 17093 → ₺17K, 1500000 → ₺1.5M
function compactMoney(val) {
  if (val >= 1000000) return '₺' + (val / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'M';
  if (val >= 10000)   return '₺' + (val / 1000).toLocaleString('tr-TR',    { maximumFractionDigits: 0 }) + 'B';
  return '₺' + val.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function compactNum(val) {
  if (val >= 1000000) return (val / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'M';
  if (val >= 10000)   return (val / 1000).toLocaleString('tr-TR',    { maximumFractionDigits: 0 }) + 'B';
  return val.toLocaleString('tr-TR');
}

function updateStats() {
  const total = products.length;
  const units = products.reduce((s, p) => s + Number(p.qty || 0), 0);
  const low   = products.filter(p => getStatus(p) === 'low').length;
  const out   = products.filter(p => getStatus(p) === 'out').length;
  const val   = products.reduce((s, p) => s + Number(p.qty || 0) * Number(p.price || 0), 0);

  document.getElementById('statTotal').textContent = compactNum(total);
  document.getElementById('statUnits').textContent = compactNum(units);
  document.getElementById('statLow').textContent   = compactNum(low);
  document.getElementById('statOut').textContent   = compactNum(out);
  document.getElementById('statValue').textContent = compactMoney(val);

  // Tooltip ile tam değeri göster (hover)
  document.getElementById('statValue').title =
    '₺' + val.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  document.getElementById('statUnits').title = units.toLocaleString('tr-TR') + ' adet';
}

function updateAlertBanner() {
  const outItems = products.filter(p => getStatus(p) === 'out');
  const lowItems = products.filter(p => getStatus(p) === 'low');

  if (!outItems.length && !lowItems.length) {
    alertBanner.hidden = true;
    alertBanner.innerHTML = '';
    return;
  }

  // Kompakt bildirim butonları — isimleri açılır panelde göster
  let html = '<div class="alert-pills">';

  if (outItems.length) {
    const names = outItems.map(p => `<span class="alert-name-chip">${escapeHtml(p.name)}</span>`).join('');
    html += `
      <button class="alert-pill pill-out" data-status="out" aria-expanded="false">
        <span class="pill-icon">🔴</span>
        <span class="pill-count">${outItems.length}</span>
        <span class="pill-label">Tükendi</span>
        <span class="pill-arrow">▾</span>
      </button>
      <div class="alert-detail" id="alertDetailOut" hidden>${names}</div>`;
  }

  if (lowItems.length) {
    const names = lowItems.map(p => `<span class="alert-name-chip">${escapeHtml(p.name)}</span>`).join('');
    html += `
      <button class="alert-pill pill-low" data-status="low" aria-expanded="false">
        <span class="pill-icon">🟡</span>
        <span class="pill-count">${lowItems.length}</span>
        <span class="pill-label">Azalıyor</span>
        <span class="pill-arrow">▾</span>
      </button>
      <div class="alert-detail" id="alertDetailLow" hidden>${names}</div>`;
  }

  html += '</div>';
  alertBanner.innerHTML = html;
  alertBanner.hidden = false;

  // Tıklama: açılır panel + listeyi filtrele
  alertBanner.querySelectorAll('.alert-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      const detailId = status === 'out' ? 'alertDetailOut' : 'alertDetailLow';
      const detail = document.getElementById(detailId);
      const isOpen = !detail.hidden;

      // Diğer açık panelleri kapat
      alertBanner.querySelectorAll('.alert-detail').forEach(d => { d.hidden = true; });
      alertBanner.querySelectorAll('.alert-pill').forEach(b => { b.setAttribute('aria-expanded', 'false'); b.classList.remove('active'); });

      if (!isOpen) {
        detail.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('active');
        // Listeyi bu duruma göre filtrele
        statusFilter.value = status;
        render();
      } else {
        // Tekrar tıklanırsa filtreyi temizle
        statusFilter.value = '';
        render();
      }
    });
  });
}

// ============================================================
// OPTİMİSTİK +/- GÜNCELLEMESİ  ← Ana hız düzeltmesi
// ============================================================
// Kullanıcı butona bastığında:
//   1. Yerel products[] dizisi HEMEN güncellenir → render() çağrılır (ms)
//   2. 600ms debounce → sadece son değer Firestore'a yazılır
//   3. Hata olursa yerel dizi geri alınır ve kullanıcıya mesaj gösterilir
async function changeQty(p, delta) {
  const currentQty = Number(p.qty);
  if (currentQty <= 0 && delta < 0) return; // 0'ın altına inmez

  const newQty = Math.max(0, currentQty + delta);

  // 1. OPTİMİSTİK: UI'yı anında güncelle
  const idx = products.findIndex(x => x.id === p.id);
  if (idx !== -1) {
    products[idx] = { ...products[idx], qty: newQty };
    render();
  }

  // 2. DEBOUNCE: Hızlı ardışık tıklamaları tek Firestore yazmasına topla
  if (pendingQtyUpdates[p.id]) {
    clearTimeout(pendingQtyUpdates[p.id].timer);
    pendingQtyUpdates[p.id].newQty = newQty;
  } else {
    pendingQtyUpdates[p.id] = { originalQty: currentQty, newQty };
  }

  pendingQtyUpdates[p.id].timer = setTimeout(async () => {
    const update = pendingQtyUpdates[p.id];
    if (!update) return;
    delete pendingQtyUpdates[p.id];

    const finalQty  = update.newQty;
    const totalDelta = finalQty - update.originalQty;

    try {
      await db.collection(PRODUCTS_COL).doc(p.id).update({
        qty: finalQty,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      if (totalDelta !== 0) logHistory(p.id, p.name, totalDelta, finalQty);
    } catch (err) {
      console.error(err);
      // 3. HATA: Yerel değeri geri al
      const revertIdx = products.findIndex(x => x.id === p.id);
      if (revertIdx !== -1) {
        products[revertIdx] = { ...products[revertIdx], qty: update.originalQty };
        render();
      }
      showToast('Güncellenemedi — bağlantını kontrol et.');
    }
  }, 600);
}

// ============================================================
// SİLME
// ============================================================
async function deleteProduct(p) {
  if (!confirm(`"${p.name}" silinsin mi?`)) return;
  try {
    // Varsa Storage görsellerini de sil
    if (storage && p.images && p.images.length) {
      for (const url of p.images) {
        try { await storage.refFromURL(url).delete(); } catch (e) { /* önemsiz */ }
      }
    }
    await deleteProductFromDb(p.id);
    showToast('Ürün silindi.');
  } catch (err) {
    console.error(err);
    showToast('Silinemedi — bağlantını kontrol et.');
  }
}

// ============================================================
// EVENT LISTENERS (araç çubuğu vb.)
// ============================================================
document.getElementById('addBtn').addEventListener('click', () => openModal());
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
productForm.addEventListener('submit', handleSubmit);
searchInput.addEventListener('input', render);
categoryFilter.addEventListener('change', render);
statusFilter.addEventListener('change', render);
sortSelect.addEventListener('change', render);
document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
document.getElementById('importInput').addEventListener('change', importData);
document.getElementById('refreshBtn').addEventListener('click', () => {
  attachProductsListener(true);
  showToast('Liste tazeleniyor…');
});

// Görünüm toggling
document.getElementById('viewGrid').addEventListener('click', () => {
  currentView = 'grid';
  document.getElementById('viewGrid').classList.add('active');
  document.getElementById('viewList').classList.remove('active');
  render();
});
document.getElementById('viewList').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('viewList').classList.add('active');
  document.getElementById('viewGrid').classList.remove('active');
  render();
});

// ============================================================
// ÇOKLU GÖRSEL YÜKLEME
// ============================================================
const fImages = document.getElementById('fImages');
const imageGalleryPreview = document.getElementById('imageGalleryPreview');
let pendingImageUrls = []; // yüklenmiş URL'ler (Storage) veya base64 string'ler

fImages.addEventListener('change', handleImagesSelect);

async function handleImagesSelect(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  if (files.some(f => !f.type.startsWith('image/'))) {
    showToast('Sadece görsel dosyaları seçebilirsin.'); return;
  }

  if (storage) {
    await uploadToStorage(files);
  } else {
    // Storage yoksa ilk görseli base64 olarak sakla (eski davranış)
    for (const file of files.slice(0, 5)) {
      const url = await fileToBase64(file, 480, 0.72);
      pendingImageUrls.push(url);
    }
    renderImagePreviews();
    showToast('Görseller hazırlandı.');
  }
  fImages.value = '';
}

async function uploadToStorage(files) {
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill   = document.getElementById('progressFill');
  const progressText   = document.getElementById('progressText');
  uploadProgress.hidden = false;
  let done = 0;

  for (const file of files) {
    const blob     = await resizeToBlob(file, 1200, 0.85);
    const path     = `products/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const ref      = storage.ref(path);
    const task     = ref.put(blob, { contentType: 'image/jpeg' });

    await new Promise((resolve, reject) => {
      task.on('state_changed',
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = `Yükleniyor ${done + 1}/${files.length} — %${pct}`;
        },
        reject,
        async () => {
          const url = await task.snapshot.ref.getDownloadURL();
          pendingImageUrls.push(url);
          done++;
          progressFill.style.width = '0%';
          renderImagePreviews();
          resolve();
        }
      );
    });
  }

  uploadProgress.hidden = true;
  progressText.textContent = 'Yükleniyor…';
  showToast(`${files.length} görsel yüklendi.`);
}

async function fileToBase64(file, maxSize, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
        else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function resizeToBlob(file, maxSize, quality) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
      else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      c.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

function renderImagePreviews() {
  imageGalleryPreview.innerHTML = pendingImageUrls.map((url, i) => `
    <div class="preview-thumb">
      <img src="${url}" alt="Görsel ${i + 1}">
      ${i === 0 ? '<span class="preview-main">Ana</span>' : ''}
      <button type="button" class="preview-remove" data-index="${i}" aria-label="Kaldır">✕</button>
    </div>
  `).join('');

  imageGalleryPreview.querySelectorAll('.preview-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.index);
      const url = pendingImageUrls[idx];
      if (storage && url.startsWith('https://firebasestorage')) {
        try { await storage.refFromURL(url).delete(); } catch (e) { /* önemsiz */ }
      }
      pendingImageUrls.splice(idx, 1);
      renderImagePreviews();
    });
  });

  imageGalleryPreview.querySelectorAll('.preview-thumb img').forEach((img, i) => {
    img.addEventListener('click', () => openLightbox(pendingImageUrls, i));
  });
}

function clearImageFields() {
  pendingImageUrls = [];
  renderImagePreviews();
  fImages.value = '';
}

// ============================================================
// ÜRÜN MODAL
// ============================================================
function openModal(product) {
  productForm.reset();
  clearImageFields();

  if (product) {
    modalTitle.textContent = 'Ürünü Düzenle';
    document.getElementById('productId').value    = product.id;
    document.getElementById('fName').value        = product.name;
    document.getElementById('fSku').value         = product.sku || '';
    document.getElementById('fCategory').value    = product.category || '';
    document.getElementById('fQty').value         = product.qty;
    document.getElementById('fMin').value         = product.min;
    document.getElementById('fPrice').value       = product.price || 0;
    document.getElementById('fNotes').value       = product.notes || '';
    pendingImageUrls = [...getProductImages(product)];
    renderImagePreviews();
  } else {
    modalTitle.textContent = 'Yeni Ürün';
    document.getElementById('productId').value = '';
  }

  modalOverlay.hidden = false;
  document.getElementById('fName').focus();
}

function closeModal() {
  modalOverlay.hidden = true;
}

async function handleSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const data = {
    name:     document.getElementById('fName').value.trim(),
    sku:      document.getElementById('fSku').value.trim(),
    category: document.getElementById('fCategory').value.trim(),
    qty:      Math.max(0, Number(document.getElementById('fQty').value)   || 0),
    min:      Math.max(0, Number(document.getElementById('fMin').value)   || 0),
    price:    Math.max(0, Number(document.getElementById('fPrice').value) || 0),
    notes:    document.getElementById('fNotes').value.trim(),
    images:   [...pendingImageUrls],
    image:    pendingImageUrls[0] || '', // geriye dönük uyumluluk
  };
  if (!data.name) return;

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Kaydediliyor…';

  try {
    if (id) {
      await updateProductInDb(id, data);
      showToast('Ürün güncellendi.');
    } else {
      await addProductToDb(data);
      showToast('Ürün eklendi.');
    }
    closeModal();
  } catch (err) {
    console.error(err);
    showToast('Kaydedilemedi — bağlantını kontrol et.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Kaydet';
  }
}

// ============================================================
// STOK GEÇMİŞİ
// ============================================================
async function openHistory(p) {
  const overlay = document.getElementById('historyOverlay');
  const list    = document.getElementById('historyList');
  document.getElementById('historyTitle').textContent = `${p.name} — Stok Geçmişi`;
  list.innerHTML = '<p class="loading-text">Yükleniyor…</p>';
  overlay.hidden = false;

  try {
    const snap = await db.collection(PRODUCTS_COL).doc(p.id)
      .collection(HISTORY_COL)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    if (snap.empty) { list.innerHTML = '<p class="empty-history">Henüz hareket kaydı yok.</p>'; return; }

    list.innerHTML = snap.docs.map(doc => {
      const d     = doc.data();
      const sign  = d.delta > 0 ? '+' : '';
      const cls   = d.delta > 0 ? 'positive' : 'negative';
      const time  = d.timestamp ? new Date(d.timestamp.toDate()).toLocaleString('tr-TR') : '—';
      return `
        <div class="history-item">
          <span class="history-delta ${cls}">${sign}${d.delta}</span>
          <span class="history-qty">→ ${d.newQty} adet</span>
          <span class="history-time">${time}</span>
          <span class="history-user">${escapeHtml(d.user || '')}</span>
        </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="empty-history">Geçmiş yüklenemedi.</p>';
  }
}

document.getElementById('historyCloseBtn').addEventListener('click', () => {
  document.getElementById('historyOverlay').hidden = true;
});
document.getElementById('historyOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('historyOverlay'))
    document.getElementById('historyOverlay').hidden = true;
});

// ============================================================
// LİGHTBOX
// ============================================================
function openLightbox(images, index) {
  if (!images || !images.length) return;
  lightboxImages = images;
  lightboxIndex  = index;
  refreshLightbox();
  document.getElementById('lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  document.body.style.overflow = '';
}

function refreshLightbox() {
  document.getElementById('lightboxImg').src = lightboxImages[lightboxIndex];
  const dotsEl = document.getElementById('lightboxDots');
  dotsEl.innerHTML = lightboxImages.map((_, i) =>
    `<button class="lightbox-dot ${i === lightboxIndex ? 'active' : ''}" data-index="${i}" aria-label="Görsel ${i + 1}"></button>`
  ).join('');
  dotsEl.querySelectorAll('.lightbox-dot').forEach(dot => {
    dot.addEventListener('click', () => { lightboxIndex = Number(dot.dataset.index); refreshLightbox(); });
  });
  const multi = lightboxImages.length > 1;
  document.getElementById('lightboxPrev').style.display = multi ? '' : 'none';
  document.getElementById('lightboxNext').style.display = multi ? '' : 'none';
}

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
});
document.getElementById('lightboxPrev').addEventListener('click', () => {
  lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
  refreshLightbox();
});
document.getElementById('lightboxNext').addEventListener('click', () => {
  lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
  refreshLightbox();
});
document.addEventListener('keydown', (e) => {
  if (document.getElementById('lightbox').hidden) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')  { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; refreshLightbox(); }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; refreshLightbox(); }
});

// ============================================================
// EXPORT / IMPORT
// ============================================================
function exportJson() {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `karali-depo-yedek-${today()}.json`);
  showToast('JSON yedek indirildi.');
}

function exportCsv() {
  const headers = ['Ad', 'SKU', 'Kategori', 'Adet', 'Min Stok', 'Fiyat (₺)', 'Stok Değeri (₺)', 'Durum', 'Notlar'];
  const rows = products.map(p => [
    p.name, p.sku || '', p.category || '', p.qty, p.min,
    Number(p.price || 0).toFixed(2),
    (Number(p.price || 0) * p.qty).toFixed(2),
    statusLabel[getStatus(p)],
    (p.notes || '').replace(/\n/g, ' '),
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `karali-depo-${today()}.csv`);
  showToast('CSV indirildi.');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().slice(0, 10); }

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('Geçersiz format');
      const batch = db.batch();
      parsed.forEach(p => {
        const ref = db.collection(PRODUCTS_COL).doc();
        batch.set(ref, {
          name:     p.name     || 'İsimsiz ürün',
          sku:      p.sku      || '',
          category: p.category || '',
          qty:      Number(p.qty)   || 0,
          min:      Number(p.min)   || 0,
          price:    Number(p.price) || 0,
          notes:    p.notes    || '',
          images:   p.images   || (p.image ? [p.image] : []),
          image:    p.image    || '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      showToast(`${parsed.length} ürün yüklendi.`);
    } catch (err) {
      console.error(err);
      showToast('Dosya okunamadı — geçerli bir yedek JSON seç.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ============================================================
// YARDIMCILAR
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  if (!str && str !== 0) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// ============================================================
// BAŞLANGIÇ
// ============================================================
updateAuthUI();
