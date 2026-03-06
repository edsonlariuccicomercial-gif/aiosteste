// LARIUCCI Brindes - Reseller Dashboard
const WHATSAPP = '5516981914537';
const PER_PAGE = 24;

let allProducts = [];
let menuData = [];
let categoryMap = {};
let filteredProducts = [];
let currentPage = 1;
let currentCategory = null; // { type: 'category'|'subcategory'|'tag', slug: string }
let filtersVisible = false;

// --- Cart ---
let cart = JSON.parse(localStorage.getItem('lariucci_cart') || '[]');

function saveCart() {
  localStorage.setItem('lariucci_cart', JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cartBadge').textContent = total;
}

function addToCart(sku, qty) {
  const p = allProducts.find(pr => pr.sku === sku);
  if (!p) return;
  const existing = cart.find(i => i.sku === sku);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ sku: p.sku, name: p.name, price: p.price, qty, image: p.mainImage });
  }
  saveCart();
  showToast(`${p.name} adicionado ao carrinho!`);
}

function removeFromCart(sku) {
  cart = cart.filter(i => i.sku !== sku);
  saveCart();
  renderCart();
}

function updateCartQty(sku, delta) {
  const item = cart.find(i => i.sku === sku);
  if (!item) return;
  item.qty += delta;
  if (item.qty < 1) item.qty = 1;
  saveCart();
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');

  if (cart.length === 0) {
    container.innerHTML = '<p class="cart-empty">Seu carrinho esta vazio</p>';
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';
  let total = 0;
  container.innerHTML = cart.map(item => {
    const subtotal = item.price * item.qty;
    total += subtotal;
    return `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 60 60%22><rect fill=%22%23f0f0f0%22 width=%2260%22 height=%2260%22/></svg>'">
        <div class="cart-item-info">
          <div class="ci-name">${item.name}</div>
          <div class="ci-sku">${item.sku}</div>
          <div class="ci-price">R$ ${subtotal.toFixed(2).replace('.', ',')}</div>
        </div>
        <div class="cart-item-actions">
          <div class="ci-qty">
            <button onclick="updateCartQty('${item.sku}', -1)">-</button>
            <span>${item.qty}</span>
            <button onclick="updateCartQty('${item.sku}', 1)">+</button>
          </div>
          <button class="ci-remove" onclick="removeFromCart('${item.sku}')">Remover</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('cartTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function toggleCart() {
  const overlay = document.getElementById('cartOverlay');
  const isActive = overlay.classList.toggle('active');
  document.body.style.overflow = isActive ? 'hidden' : '';
  if (isActive) renderCart();
}

function sendCartWhatsapp() {
  if (cart.length === 0) return;
  let total = 0;
  let msg = 'Ola! Gostaria de fazer o seguinte pedido:\n\n';
  cart.forEach(item => {
    const sub = item.price * item.qty;
    total += sub;
    msg += `*${item.sku}* - ${item.name}\nQtd: ${item.qty} x R$ ${item.price.toFixed(2).replace('.', ',')} = R$ ${sub.toFixed(2).replace('.', ',')}\n\n`;
  });
  msg += `*Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\nForma de pagamento: Boleto Bancario\n\nAguardo retorno!`;
  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

function cardQty(btn, delta) {
  const container = btn.closest('.card-qty');
  const span = container.querySelector('.card-qty-val');
  let val = parseInt(span.textContent) || 1;
  val += delta;
  if (val < 1) val = 1;
  if (val > 999) val = 999;
  span.textContent = val;
}

function addToCartFromCard(sku, btn) {
  const card = btn.closest('.product-card');
  const qty = parseInt(card.querySelector('.card-qty-val').textContent) || 1;
  addToCart(sku, qty);
  // Reset qty to 1 after adding
  card.querySelector('.card-qty-val').textContent = '1';
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// --- Checkout ---
function goToCheckout() {
  if (cart.length === 0) return;
  document.getElementById('cartOverlay').classList.remove('active');
  document.getElementById('checkoutPage').style.display = 'block';
  document.body.style.overflow = 'hidden';
  renderCheckoutSummary();
}

function backFromCheckout() {
  document.getElementById('checkoutPage').style.display = 'none';
  document.body.style.overflow = '';
  toggleCart();
}

function renderCheckoutSummary() {
  const container = document.getElementById('checkoutItems');
  let total = 0;
  container.innerHTML = cart.map(item => {
    const sub = item.price * item.qty;
    total += sub;
    return `
      <div class="ck-item">
        <span class="ck-item-name">${item.name}</span>
        <span class="ck-item-qty">x${item.qty}</span>
        <span>R$ ${sub.toFixed(2).replace('.', ',')}</span>
      </div>
    `;
  }).join('');
  document.getElementById('ckSubtotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  document.getElementById('ckTotal').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function lookupCep() {
  const cep = document.getElementById('ckCep').value.replace(/\D/g, '');
  if (cep.length !== 8) return;
  fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then(r => r.json())
    .then(d => {
      if (!d.erro) {
        document.getElementById('ckCity').value = d.localidade || '';
        document.getElementById('ckState').value = d.uf || '';
        document.getElementById('ckAddress').value = d.logradouro || '';
        document.getElementById('ckNeighborhood').value = d.bairro || '';
      }
    })
    .catch(() => {});
}

function placeOrder() {
  const name = document.getElementById('ckName').value.trim();
  const doc = document.getElementById('ckDoc').value.trim();
  const email = document.getElementById('ckEmail').value.trim();
  const phone = document.getElementById('ckPhone').value.trim();
  const cep = document.getElementById('ckCep').value.trim();
  const city = document.getElementById('ckCity').value.trim();
  const state = document.getElementById('ckState').value.trim();
  const address = document.getElementById('ckAddress').value.trim();
  const neighborhood = document.getElementById('ckNeighborhood').value.trim();

  if (!name || !doc || !email || !phone || !cep || !city || !state || !address || !neighborhood) {
    alert('Por favor, preencha todos os campos obrigatorios.');
    return;
  }

  const orderNum = 'LB-' + Date.now().toString(36).toUpperCase();
  let total = 0;
  let itemsMsg = '';
  cart.forEach(item => {
    const sub = item.price * item.qty;
    total += sub;
    itemsMsg += `- ${item.sku} | ${item.name} | Qtd: ${item.qty} | R$ ${sub.toFixed(2).replace('.', ',')}\n`;
  });

  const comp = document.getElementById('ckComp').value.trim();
  const notes = document.getElementById('ckNotes').value.trim();

  const msg = `NOVO PEDIDO - ${orderNum}\n\n` +
    `Cliente: ${name}\nCPF/CNPJ: ${doc}\nEmail: ${email}\nTelefone: ${phone}\n\n` +
    `Endereco: ${address}${comp ? ', ' + comp : ''}\nBairro: ${neighborhood}\nCidade: ${city} - ${state}\nCEP: ${cep}\n\n` +
    `ITENS:\n${itemsMsg}\n` +
    `TOTAL: R$ ${total.toFixed(2).replace('.', ',')}\n` +
    `Pagamento: Boleto Bancario\n` +
    (notes ? `\nObs: ${notes}` : '');

  window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');

  document.getElementById('checkoutPage').style.display = 'none';
  document.getElementById('orderConfirm').style.display = 'flex';
  document.getElementById('orderNumber').textContent = orderNum;

  cart = [];
  saveCart();
}

// --- Init ---
async function init() {
  try {
    // Check localStorage for admin-updated data first, fallback to static JSON
    let data;
    const stored = localStorage.getItem('lariucci_products_data');
    if (stored) {
      data = JSON.parse(stored);
    }
    // If no stored data or missing menu, load static file
    if (!data || !data.menu) {
      const resp = await fetch('data/products-reseller.json');
      const staticData = await resp.json();
      if (!data) {
        data = staticData;
      } else {
        // Merge: keep fresh products, add missing menu/categories
        data.menu = staticData.menu;
        data.categories = data.categories || staticData.categories;
      }
    }
    allProducts = data.products;
    menuData = data.menu;
    buildCategoryMap(data);
    buildNav();
    buildColorFilter();
    applyFilters();
    updateCartBadge();
  } catch (e) {
    document.getElementById('productGrid').innerHTML = '<p style="text-align:center;padding:40px;color:#e74c3c">Erro ao carregar produtos.</p>';
    console.error(e);
  }
}

function buildCategoryMap(data) {
  // Build map from menu slugs to product IDs using the categories field on each product
  // menu items have: type=category (parent), type=subcategory, type=tag
  // products have: categories[] (array of parent category slugs)
  // For subcategory filtering, we need the category-map data which maps subcategory slugs to product IDs
  // Since we don't have that granularity, we'll use the approach of fetching category-map.json
  try {
    // We'll load category-map separately
  } catch (e) {}
}

// --- Navigation ---
function buildNav() {
  const nav = document.getElementById('navMenu');
  // "Todos" link
  const allLink = document.createElement('div');
  allLink.className = 'nav-item';
  allLink.innerHTML = '<a href="#" class="active" data-type="all">Todos os Produtos</a>';
  allLink.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    currentCategory = null;
    currentPage = 1;
    updateNavActive(e.target);
    updateBreadcrumb('Todos os Produtos');
    applyFilters();
  });
  nav.appendChild(allLink);

  for (const menu of menuData) {
    const item = document.createElement('div');
    item.className = 'nav-item';

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = menu.name;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentCategory = { type: menu.type === 'tags' ? 'tags-group' : 'category', slug: menu.slug, name: menu.name };
      currentPage = 1;
      updateNavActive(link);
      updateBreadcrumb(menu.name);
      applyFilters();
    });
    item.appendChild(link);

    if (menu.children && menu.children.length) {
      const dropdown = document.createElement('div');
      dropdown.className = 'nav-dropdown';
      for (const child of menu.children) {
        const childLink = document.createElement('a');
        childLink.href = '#';
        childLink.textContent = child.name;
        childLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const type = child.type === 'tag' ? 'tag' : 'subcategory';
          currentCategory = { type, slug: child.slug, parentSlug: menu.slug, name: child.name };
          currentPage = 1;
          updateNavActive(link);
          updateBreadcrumb(menu.name + ' > ' + child.name);
          applyFilters();
        });
        dropdown.appendChild(childLink);

        if (child.children && child.children.length) {
          const subHeader = document.createElement('div');
          subHeader.className = 'sub-header';
          subHeader.textContent = child.name;
          // Replace the link with header + sub-items
          dropdown.removeChild(childLink);
          dropdown.appendChild(subHeader);
          for (const sub of child.children) {
            const subLink = document.createElement('a');
            subLink.href = '#';
            subLink.textContent = '  ' + sub.name;
            subLink.style.paddingLeft = '28px';
            subLink.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              currentCategory = { type: 'subcategory', slug: sub.slug, parentSlug: menu.slug, name: sub.name };
              currentPage = 1;
              updateNavActive(link);
              updateBreadcrumb(menu.name + ' > ' + child.name + ' > ' + sub.name);
              applyFilters();
            });
            dropdown.appendChild(subLink);
          }
        }
      }
      item.appendChild(dropdown);
    }
    nav.appendChild(item);
  }
}

function updateNavActive(activeEl) {
  document.querySelectorAll('.nav-item > a').forEach(a => a.classList.remove('active'));
  activeEl.classList.add('active');
}

function updateBreadcrumb(text) {
  document.getElementById('breadcrumbCurrent').textContent = text;
}

function buildColorFilter() {
  const colorSet = new Set();
  for (const p of allProducts) {
    for (const c of p.colors) {
      if (c.name) colorSet.add(c.name);
    }
  }
  const select = document.getElementById('colorFilter');
  [...colorSet].sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

// --- Filtering ---
function applyFilters() {
  let products = [...allProducts];
  const sortVal = document.getElementById('sortSelect').value;
  const colorVal = document.getElementById('colorFilter').value;
  const tagVal = document.getElementById('tagFilter').value;
  const searchVal = document.getElementById('searchInput').value.trim().toLowerCase();

  // Category/subcategory filter
  if (currentCategory) {
    const cat = currentCategory;
    if (cat.type === 'category') {
      products = products.filter(p => p.categories.includes(cat.slug));
    } else if (cat.type === 'subcategory') {
      // Use subcategories array from product data (fetched from API per subcategory)
      products = products.filter(p => p.subcategories && p.subcategories.includes(cat.slug));
    } else if (cat.type === 'tag') {
      products = products.filter(p => p.tags.some(t => t.slug === cat.slug));
    } else if (cat.type === 'tags-group') {
      products = products.filter(p => p.tags.length > 0);
    }
  }

  // Search
  if (searchVal) {
    products = products.filter(p => {
      const searchable = (p.name + ' ' + p.sku + ' ' + p.tags.map(t => t.name).join(' ')).toLowerCase();
      return searchable.includes(searchVal);
    });
  }

  // Color filter
  if (colorVal) {
    products = products.filter(p => p.colors.some(c => c.name === colorVal));
  }

  // Tag filter
  if (tagVal) {
    products = products.filter(p => p.tags.some(t => t.slug === tagVal));
  }

  // Sort
  switch (sortVal) {
    case 'price-asc': products.sort((a, b) => a.price - b.price); break;
    case 'price-desc': products.sort((a, b) => b.price - a.price); break;
    case 'name-asc': products.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'name-desc': products.sort((a, b) => b.name.localeCompare(a.name)); break;
    case 'sku-asc': products.sort((a, b) => a.sku.localeCompare(b.sku)); break;
  }

  filteredProducts = products;
  document.getElementById('resultCount').textContent = `${products.length} produtos encontrados`;
  renderProducts();
  renderPagination();
}

function toggleFilters() {
  filtersVisible = !filtersVisible;
  document.getElementById('filterSidebar').classList.toggle('active', filtersVisible);
  document.getElementById('filterToggle').classList.toggle('active', filtersVisible);
}

// --- Rendering ---
function renderProducts() {
  const grid = document.getElementById('productGrid');
  const start = (currentPage - 1) * PER_PAGE;
  const pageProducts = filteredProducts.slice(start, start + PER_PAGE);

  if (pageProducts.length === 0) {
    grid.innerHTML = '<p style="text-align:center;padding:60px;color:#7f8c8d;grid-column:1/-1">Nenhum produto encontrado.</p>';
    return;
  }

  grid.innerHTML = pageProducts.map(p => {
    const tag = p.tags[0];
    const tagHtml = tag ? `<span class="tag" style="background:${tag.bg || '#1e73be'};color:${tag.text || '#fff'}">${tag.name}</span>` : '';
    const stockNum = parseInt(String(p.stock).replace(/\./g, ''));
    const stockClass = stockNum < 100 ? 'low' : '';
    const stockText = stockNum > 0 ? `${p.stock} em estoque` : 'Consultar';

    return `
      <div class="product-card" data-sku="${p.sku}">
        ${tagHtml}
        <div class="img-wrap" onclick="openModal('${p.sku}')">
          <img src="${p.mainImage}" alt="${p.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect fill=%22%23f0f0f0%22 width=%22200%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23ccc%22 font-size=%2214%22>Sem imagem</text></svg>'">
        </div>
        <div class="info" onclick="openModal('${p.sku}')">
          <div class="sku">${p.sku}</div>
          <div class="name">${p.name}</div>
          <div class="colors">
            ${p.colors.slice(0, 8).map(c => `<span class="color-dot" style="background:${c.hex}" title="${c.name}"></span>`).join('')}
            ${p.colors.length > 8 ? `<span style="font-size:11px;color:#999">+${p.colors.length - 8}</span>` : ''}
          </div>
          <div class="price">R$ ${p.price.toFixed(2).replace('.', ',')} <span class="price-unit">/un</span></div>
          <div class="stock ${stockClass}">${stockText}</div>
        </div>
        <div class="card-cart-controls">
          <div class="card-qty" onclick="event.stopPropagation()">
            <button class="card-qty-btn" onclick="cardQty(this,-1)">-</button>
            <span class="card-qty-val">1</span>
            <button class="card-qty-btn" onclick="cardQty(this,1)">+</button>
          </div>
          <button class="btn-comprar" onclick="event.stopPropagation();addToCartFromCard('${p.sku}',this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            COMPRAR
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination() {
  const totalPages = Math.ceil(filteredProducts.length / PER_PAGE);
  const container = document.getElementById('pagination');

  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  const start = Math.max(1, currentPage - 3);
  const end = Math.min(totalPages, currentPage + 3);

  if (currentPage > 1) html += `<button onclick="goToPage(${currentPage - 1})">&#8249;</button>`;
  if (start > 1) html += `<button onclick="goToPage(1)">1</button>`;
  if (start > 2) html += `<button disabled>...</button>`;

  for (let i = start; i <= end; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (end < totalPages - 1) html += `<button disabled>...</button>`;
  if (end < totalPages) html += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
  if (currentPage < totalPages) html += `<button onclick="goToPage(${currentPage + 1})">&#8250;</button>`;

  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  renderProducts();
  renderPagination();
  window.scrollTo({ top: 200, behavior: 'smooth' });
}

// --- Modal ---
function openModal(sku) {
  const p = allProducts.find(pr => pr.sku === sku);
  if (!p) return;

  document.getElementById('modalSku').textContent = p.sku;
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalImg').src = p.mainImage;
  document.getElementById('modalPrice').textContent = `R$ ${p.price.toFixed(2).replace('.', ',')} /un`;
  document.getElementById('modalQty').value = 1;

  // Tag
  const tagEl = document.getElementById('modalTag');
  if (p.tags[0]) {
    tagEl.textContent = p.tags[0].name;
    tagEl.style.background = p.tags[0].bg || '#1e73be';
    tagEl.style.color = p.tags[0].text || '#fff';
    tagEl.style.display = 'inline';
  } else {
    tagEl.style.display = 'none';
  }

  // Stock
  const stockEl = document.getElementById('modalStock');
  const stockNum = parseInt(String(p.stock).replace(/\./g, ''));
  if (stockNum > 0) {
    stockEl.textContent = `${p.stock} unidades em estoque`;
    stockEl.className = 'modal-stock' + (stockNum < 100 ? ' low' : '');
  } else {
    stockEl.textContent = 'Estoque sob consulta';
    stockEl.className = 'modal-stock low';
  }

  // Thumbnails
  const thumbsDiv = document.getElementById('modalThumbs');
  if (p.allImages && p.allImages.length > 1) {
    thumbsDiv.innerHTML = p.allImages.map((img, i) => {
      const thumb = (p.thumbs && p.thumbs[i]) || img;
      return `<img src="${thumb}" data-full="${img}" class="${i === 0 ? 'active' : ''}" onclick="document.getElementById('modalImg').src=this.dataset.full;document.querySelectorAll('.modal-thumbs img').forEach(t=>t.classList.remove('active'));this.classList.add('active')">`;
    }).join('');
  } else {
    thumbsDiv.innerHTML = '';
  }

  // Colors
  const colorsDiv = document.getElementById('modalColors');
  if (p.colors.length > 0) {
    colorsDiv.innerHTML = `
      <h4 style="font-size:14px;margin-bottom:6px">Cores disponiveis (${p.colors.length})</h4>
      <div class="color-options">
        ${p.colors.map(c => `<span class="color-opt" style="background:${c.hex}" title="${c.name}"></span>`).join('')}
      </div>
    `;
  } else {
    colorsDiv.innerHTML = '';
  }

  // Video
  const videoDiv = document.getElementById('modalVideo');
  if (p.video) {
    videoDiv.innerHTML = `<a class="video-link" href="${p.video}" target="_blank">&#9654; Ver video do produto</a>`;
  } else {
    videoDiv.innerHTML = '';
  }

  // WhatsApp
  const msg = encodeURIComponent(`Ola! Gostaria de solicitar um orcamento para:\n\n*${p.sku} - ${p.name}*\nPreco unitario: R$ ${p.price.toFixed(2).replace('.', ',')}\n\nAguardo retorno!`);
  document.getElementById('modalWhatsapp').href = `https://wa.me/${WHATSAPP}?text=${msg}`;

  // Store current SKU for add-to-cart
  document.getElementById('modalAddCart').dataset.sku = p.sku;

  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function changeModalQty(delta) {
  const input = document.getElementById('modalQty');
  let val = parseInt(input.value) || 1;
  val += delta;
  if (val < 1) val = 1;
  input.value = val;
}

function addToCartFromModal() {
  const sku = document.getElementById('modalAddCart').dataset.sku;
  const qty = parseInt(document.getElementById('modalQty').value) || 1;
  addToCart(sku, qty);
  closeModal();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// --- Search ---
function doSearch() {
  const val = document.getElementById('searchInput').value.trim();
  if (val) {
    currentCategory = null;
    currentPage = 1;
    updateNavActive(document.querySelector('.nav-item > a'));
    updateBreadcrumb(`Busca: "${val}"`);
    applyFilters();
  }
}

// --- Home ---
function goHome() {
  document.getElementById('checkoutPage').style.display = 'none';
  document.getElementById('orderConfirm').style.display = 'none';
  document.getElementById('cartOverlay').classList.remove('active');
  document.body.style.overflow = '';
  currentCategory = null;
  currentPage = 1;
  document.getElementById('searchInput').value = '';
  document.getElementById('colorFilter').value = '';
  document.getElementById('tagFilter').value = '';
  updateNavActive(document.querySelector('.nav-item > a'));
  updateBreadcrumb('Todos os Produtos');
  applyFilters();
  window.scrollTo({ top: 0 });
}

// --- Events ---
let searchTimer;
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (e.target.value.trim()) {
        currentCategory = null;
        currentPage = 1;
        updateBreadcrumb(`Busca: "${e.target.value.trim()}"`);
      }
      applyFilters();
    }, 300);
  });

  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      if (document.getElementById('cartOverlay').classList.contains('active')) toggleCart();
    }
  });
});

// Make functions global
window.openModal = openModal;
window.goToPage = goToPage;
window.closeModal = closeModal;
window.goHome = goHome;
window.doSearch = doSearch;
window.toggleFilters = toggleFilters;
window.applyFilters = applyFilters;
window.toggleCart = toggleCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQty = updateCartQty;
window.sendCartWhatsapp = sendCartWhatsapp;
window.goToCheckout = goToCheckout;
window.backFromCheckout = backFromCheckout;
window.lookupCep = lookupCep;
window.placeOrder = placeOrder;
window.changeModalQty = changeModalQty;
window.addToCartFromModal = addToCartFromModal;
window.cardQty = cardQty;
window.addToCartFromCard = addToCartFromCard;

// Start
init();
