// =========================================================
// Karali Depo — Stok Kontrol
// Firebase Authentication (e-posta/şifre) + Firestore (gerçek
// zamanlı, tüm cihazlar arasında ortak veri) kullanır.
// Kurulum için README.md → "Firebase Kurulumu" bölümüne bak.
// =========================================================

let products = [];
let unsubscribeProducts = null;

const PRODUCTS_COLLECTION = 'products';

// ---------- DOM referansları ----------
const authOverlay = document.getElementById('authOverlay');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
const appRoot = document.getElementById('appRoot');
const userEmailLabel = document.getElementById('userEmailLabel');
const logoutBtn = document.getElementById('logoutBtn');

const grid = document.getElementById('grid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const statusFilter = document.getElementById('statusFilter');
const modalOverlay = document.getElementById('modalOverlay');
const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const categoryList = document.getElementById('categoryList');

let authMode = 'login'; // 'login' | 'register'

// ---------- Kimlik doğrulama ----------
authToggleBtn.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  updateAuthUI();
});

function updateAuthUI(){
  authError.hidden = true;
  if(authMode === 'login'){
    authTitle.textContent = 'Giriş Yap';
    authSubtitle.textContent = "Karali Depo'ya erişmek için giriş yap.";
    authSubmitBtn.textContent = 'Giriş Yap';
    authToggleBtn.textContent = 'Hesabın yok mu? Kayıt ol';
    authPassword.setAttribute('autocomplete', 'current-password');
  } else {
    authTitle.textContent = 'Kayıt Ol';
    authSubtitle.textContent = 'E-posta ve şifre ile yeni bir hesap oluştur.';
    authSubmitBtn.textContent = 'Kayıt Ol';
    authToggleBtn.textContent = 'Zaten hesabın var mı? Giriş yap';
    authPassword.setAttribute('autocomplete', 'new-password');
  }
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const email = authEmail.value.trim();
  const password = authPassword.value;
  authSubmitBtn.disabled = true;

  try{
    if(authMode === 'login'){
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
    }
  }catch(err){
    authError.textContent = translateAuthError(err);
    authError.hidden = false;
  }finally{
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

function translateAuthError(err){
  const map = {
    'auth/invalid-email': 'Geçersiz e-posta adresi.',
    'auth/user-not-found': 'Bu e-posta ile kayıtlı bir hesap bulunamadı.',
    'auth/wrong-password': 'Şifre hatalı.',
    'auth/invalid-credential': 'E-posta veya şifre hatalı.',
    'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı — giriş yapmayı dene.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/network-request-failed': 'Bağlantı hatası — internetini kontrol et.',
    'auth/configuration-not-found': 'Firebase yapılandırması eksik — firebase-config.js dosyasını doldurduğundan emin ol ve Firebase Console\'da E-posta/Şifre girişini etkinleştir.',
  };
  return map[err.code] || ('Hata: ' + err.message);
}

auth.onAuthStateChanged((user) => {
  if(user){
    authOverlay.hidden = true;
    appRoot.hidden = false;
    userEmailLabel.textContent = user.email;
    attachProductsListener();
  } else {
    appRoot.hidden = true;
    authOverlay.hidden = false;
    if(unsubscribeProducts){ unsubscribeProducts(); unsubscribeProducts = null; }
    products = [];
  }
});

// ---------- Firestore: ürün verisi (tüm hesaplar arasında ortak) ----------
function attachProductsListener(){
  if(unsubscribeProducts) return;
  unsubscribeProducts = db.collection(PRODUCTS_COLLECTION)
    .orderBy('name')
    .onSnapshot(
      (snapshot) => {
        products = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        render();
      },
      (err) => {
        console.error('Firestore okuma hatası:', err);
        showToast('Veriler yüklenemedi — Firestore kurulumunu kontrol et.');
      }
    );
}

async function addProductToDb(data){
  await db.collection(PRODUCTS_COLLECTION).add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateProductInDb(id, data){
  await db.collection(PRODUCTS_COLLECTION).doc(id).update(data);
}

async function deleteProductFromDb(id){
  await db.collection(PRODUCTS_COLLECTION).doc(id).delete();
}

// ---------- Durum hesaplama ----------
function getStatus(p){
  if(p.qty <= 0) return 'out';
  if(p.qty <= p.min) return 'low';
  return 'ok';
}
const statusLabel = {ok:'Stokta', low:'Azalıyor', out:'Tükendi'};

// ---------- Render ----------
function render(){
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const currentCat = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">Tüm kategoriler</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  categoryFilter.value = cats.includes(currentCat) ? currentCat : '';
  categoryList.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">`).join('');

  const q = searchInput.value.trim().toLowerCase();
  const catF = categoryFilter.value;
  const statF = statusFilter.value;

  const filtered = products.filter(p => {
    const matchesQ = !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q);
    const matchesCat = !catF || p.category === catF;
    const matchesStat = !statF || getStatus(p) === statF;
    return matchesQ && matchesCat && matchesStat;
  });

  grid.innerHTML = '';
  emptyState.hidden = products.length !== 0;

  if(products.length && filtered.length === 0){
    grid.innerHTML = `<p style="color:#fff; grid-column:1/-1; text-align:center; margin-top:20px;">Aramanla eşleşen ürün yok.</p>`;
  }

  filtered
    .sort((a,b) => {
      const order = {out:0, low:1, ok:2};
      return order[getStatus(a)] - order[getStatus(b)] || a.name.localeCompare(b.name,'tr');
    })
    .forEach(p => grid.appendChild(renderCard(p)));

  updateStats();
}

function renderCard(p){
  const status = getStatus(p);
  const card = document.createElement('div');
  card.className = `brick product-brick status-${status}`;
  card.innerHTML = `
    <div class="studs"><span></span><span></span><span></span></div>
    <div class="brick-face">
      <div class="p-top">
        <div class="p-top-info">
          <div class="p-thumb">${p.image ? `<img src="${p.image}" alt="">` : '🧱'}</div>
          <div class="p-name-wrap">
            <div class="p-name">${escapeHtml(p.name)}</div>
            ${p.sku ? `<div class="p-sku">${escapeHtml(p.sku)}</div>` : ''}
          </div>
        </div>
        ${p.category ? `<span class="p-cat">${escapeHtml(p.category)}</span>` : ''}
      </div>
      <span class="p-badge">${statusLabel[status]}</span>
      <div class="p-qty-row">
        <div class="qty-controls">
          <button class="qty-btn" data-action="dec" aria-label="Azalt">−</button>
          <span class="qty-num">${p.qty}</span>
          <button class="qty-btn" data-action="inc" aria-label="Artır">+</button>
        </div>
        <span class="p-min">min: ${p.min}</span>
      </div>
      ${p.price ? `<div class="p-price">Birim: ₺${Number(p.price).toFixed(2)} · Toplam: ₺${(p.price*p.qty).toFixed(2)}</div>` : ''}
      <div class="p-actions">
        <button data-action="edit">Düzenle</button>
        <button data-action="delete" class="danger">Sil</button>
      </div>
    </div>
  `;

  card.querySelector('[data-action="inc"]').addEventListener('click', () => changeQty(p, 1));
  card.querySelector('[data-action="dec"]').addEventListener('click', () => changeQty(p, -1));
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(p));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProduct(p));

  return card;
}

function updateStats(){
  document.getElementById('statTotal').textContent = products.length;
  document.getElementById('statUnits').textContent = products.reduce((s,p) => s + Number(p.qty||0), 0);
  document.getElementById('statLow').textContent = products.filter(p => getStatus(p) === 'low').length;
  document.getElementById('statOut').textContent = products.filter(p => getStatus(p) === 'out').length;
  const value = products.reduce((s,p) => s + Number(p.qty||0) * Number(p.price||0), 0);
  document.getElementById('statValue').textContent = '₺' + value.toLocaleString('tr-TR', {maximumFractionDigits:0});
}

// ---------- İşlemler ----------
async function changeQty(p, delta){
  const newQty = Math.max(0, Number(p.qty) + delta);
  try{
    await updateProductInDb(p.id, {qty: newQty});
  }catch(err){
    console.error(err);
    showToast('Güncellenemedi — bağlantını kontrol et.');
  }
}

async function deleteProduct(p){
  if(!confirm(`"${p.name}" silinsin mi?`)) return;
  try{
    await deleteProductFromDb(p.id);
    showToast('Ürün silindi.');
  }catch(err){
    console.error(err);
    showToast('Silinemedi — bağlantını kontrol et.');
  }
}

document.getElementById('addBtn').addEventListener('click', () => openModal());
document.getElementById('cancelBtn').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) closeModal(); });
productForm.addEventListener('submit', handleSubmit);
searchInput.addEventListener('input', render);
categoryFilter.addEventListener('change', render);
statusFilter.addEventListener('change', render);
document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importInput').addEventListener('change', importData);

const fImage = document.getElementById('fImage');
const fImageData = document.getElementById('fImageData');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');

fImage.addEventListener('change', handleImageSelect);
removeImageBtn.addEventListener('click', clearImageField);

function handleImageSelect(e){
  const file = e.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){
    showToast('Lütfen bir görsel dosyası seç.');
    return;
  }
  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      const dataUrl = resizeImage(img, 480, 0.72);
      fImageData.value = dataUrl;
      setImagePreview(dataUrl);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// Görseli 1MB'lık Firestore belge sınırı içinde tutmak için küçültüp sıkıştırır
function resizeImage(img, maxSize, quality){
  const canvas = document.createElement('canvas');
  let {width, height} = img;
  if(width > height){
    if(width > maxSize){ height = Math.round(height * maxSize / width); width = maxSize; }
  } else {
    if(height > maxSize){ width = Math.round(width * maxSize / height); height = maxSize; }
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function setImagePreview(dataUrl){
  if(dataUrl){
    imagePreview.classList.remove('empty');
    imagePreview.innerHTML = `<img src="${dataUrl}" alt="">`;
    removeImageBtn.hidden = false;
  } else {
    imagePreview.classList.add('empty');
    imagePreview.textContent = 'Görsel yok';
    removeImageBtn.hidden = true;
  }
}

function clearImageField(){
  fImageData.value = '';
  fImage.value = '';
  setImagePreview(null);
}

function openModal(product){
  productForm.reset();
  clearImageField();
  if(product){
    modalTitle.textContent = 'Ürünü Düzenle';
    document.getElementById('productId').value = product.id;
    document.getElementById('fName').value = product.name;
    document.getElementById('fSku').value = product.sku || '';
    document.getElementById('fCategory').value = product.category || '';
    document.getElementById('fQty').value = product.qty;
    document.getElementById('fMin').value = product.min;
    document.getElementById('fPrice').value = product.price || 0;
    if(product.image){
      fImageData.value = product.image;
      setImagePreview(product.image);
    }
  } else {
    modalTitle.textContent = 'Yeni Ürün';
    document.getElementById('productId').value = '';
  }
  modalOverlay.hidden = false;
  document.getElementById('fName').focus();
}

function closeModal(){
  modalOverlay.hidden = true;
}

async function handleSubmit(e){
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const data = {
    name: document.getElementById('fName').value.trim(),
    sku: document.getElementById('fSku').value.trim(),
    category: document.getElementById('fCategory').value.trim(),
    qty: Math.max(0, Number(document.getElementById('fQty').value) || 0),
    min: Math.max(0, Number(document.getElementById('fMin').value) || 0),
    price: Math.max(0, Number(document.getElementById('fPrice').value) || 0),
    image: fImageData.value || '',
  };
  if(!data.name){ return; }

  const submitBtn = productForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try{
    if(id){
      await updateProductInDb(id, data);
      showToast('Ürün güncellendi.');
    } else {
      await addProductToDb(data);
      showToast('Ürün eklendi.');
    }
    closeModal();
  }catch(err){
    console.error(err);
    showToast('Kaydedilemedi — bağlantını kontrol et.');
  }finally{
    submitBtn.disabled = false;
  }
}

// ---------- Yedekleme ----------
function exportData(){
  const blob = new Blob([JSON.stringify(products, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `karali-depo-yedek-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Yedek indirildi.');
}

async function importData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(!Array.isArray(parsed)) throw new Error('Geçersiz format');
      const batch = db.batch();
      parsed.forEach(p => {
        const ref = db.collection(PRODUCTS_COLLECTION).doc();
        batch.set(ref, {
          name: p.name || 'İsimsiz ürün',
          sku: p.sku || '',
          category: p.category || '',
          qty: Number(p.qty) || 0,
          min: Number(p.min) || 0,
          price: Number(p.price) || 0,
          image: p.image || '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      showToast('Yedek yüklendi.');
    }catch(err){
      console.error(err);
      showToast('Dosya okunamadı — geçerli bir yedek JSON dosyası seç.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ---------- Yardımcılar ----------
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Başlangıç ----------
updateAuthUI();
