// ---------- Depo verisi ----------
const STORAGE_KEY = 'tugla-depo-urunler';

function loadProducts(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : seedProducts();
  }catch(e){
    console.error('Depo okunamadı:', e);
    return [];
  }
}

function saveProducts(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }catch(e){
    console.error('Depo kaydedilemedi:', e);
    showToast('Kaydetme hatası — tarayıcı depolamasına erişilemedi.');
  }
}

function seedProducts(){
  return [
    {id: uid(), name:'Kırmızı 2x4 Tuğla', sku:'LG-2X4-RD', category:'Bloklar', qty:120, min:20, price:2.5},
    {id: uid(), name:'Mavi 2x2 Plaka', sku:'LG-2X2-BL', category:'Plakalar', qty:8, min:15, price:1.2},
    {id: uid(), name:'Sarı Minifigür Kafası', sku:'LG-MF-HD', category:'Minifigür', qty:0, min:10, price:0.8},
  ];
}

function uid(){
  return Math.random().toString(36).slice(2,9);
}

let products = loadProducts();

// ---------- DOM referansları ----------
const grid = document.getElementById('grid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const statusFilter = document.getElementById('statusFilter');
const modalOverlay = document.getElementById('modalOverlay');
const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const categoryList = document.getElementById('categoryList');

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
  if(file.size > 1.5 * 1024 * 1024){
    showToast('Görsel çok büyük — 1.5MB altında bir dosya seç.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    fImageData.value = reader.result;
    setImagePreview(reader.result);
  };
  reader.readAsDataURL(file);
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

// ---------- Durum hesaplama ----------
function getStatus(p){
  if(p.qty <= 0) return 'out';
  if(p.qty <= p.min) return 'low';
  return 'ok';
}
const statusLabel = {ok:'Stokta', low:'Azalıyor', out:'Tükendi'};

// ---------- Render ----------
function render(){
  // kategori filtre listesini güncelle
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

  card.querySelector('[data-action="inc"]').addEventListener('click', () => changeQty(p.id, 1));
  card.querySelector('[data-action="dec"]').addEventListener('click', () => changeQty(p.id, -1));
  card.querySelector('[data-action="edit"]').addEventListener('click', () => openModal(p));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteProduct(p.id));

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
function changeQty(id, delta){
  const p = products.find(x => x.id === id);
  if(!p) return;
  p.qty = Math.max(0, Number(p.qty) + delta);
  saveProducts();
  render();
}

function deleteProduct(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  if(!confirm(`"${p.name}" silinsin mi?`)) return;
  products = products.filter(x => x.id !== id);
  saveProducts();
  render();
  showToast('Ürün silindi.');
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

function handleSubmit(e){
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

  if(id){
    const p = products.find(x => x.id === id);
    Object.assign(p, data);
    showToast('Ürün güncellendi.');
  } else {
    products.push({id: uid(), ...data});
    showToast('Ürün eklendi.');
  }
  saveProducts();
  closeModal();
  render();
}

// ---------- Yedekleme ----------
function exportData(){
  const blob = new Blob([JSON.stringify(products, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tugla-depo-yedek-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Yedek indirildi.');
}

function importData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(!Array.isArray(parsed)) throw new Error('Geçersiz format');
      products = parsed.map(p => ({
        id: p.id || uid(),
        name: p.name || 'İsimsiz ürün',
        sku: p.sku || '',
        category: p.category || '',
        qty: Number(p.qty) || 0,
        min: Number(p.min) || 0,
        price: Number(p.price) || 0,
        image: p.image || '',
      }));
      saveProducts();
      render();
      showToast('Yedek yüklendi.');
    }catch(err){
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
render();
