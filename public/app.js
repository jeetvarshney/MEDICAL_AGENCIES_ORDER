/* MediWholesale — storefront logic (no price shown anywhere) */

const $ = (s) => document.querySelector(s);

const state = {
  products: [],
  cart: loadCart(),       // { productId: qty }
  category: 'All',
  query: '',
  view: 'cart',           // cart | checkout | success
};

/* ------------------------------ helpers ------------------------------ */

function loadCart() {
  try { return JSON.parse(localStorage.getItem('mws_cart')) || {}; }
  catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem('mws_cart', JSON.stringify(state.cart)); } catch {}
}

let toastTimer;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.list = data.errors;
    throw err;
  }
  return data;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function stockBadge(stock) {
  if (stock <= 0) return '<span class="badge badge-out">Out of stock</span>';
  if (stock <= 25) return `<span class="badge badge-warn">Only ${stock} left</span>`;
  return `<span class="badge badge-ok">In stock: ${stock}</span>`;
}

/* --------------------------- product catalog --------------------------- */

async function loadProducts() {
  try {
    const data = await api('/api/products');
    state.products = data.products;
    $('#shopName').textContent = data.shopName || 'JAI MEDICAL AGENCIES';
    $('#shopNameFoot').textContent = data.shopName || 'JAI MEDICAL AGENCIES';
    document.title = `${data.shopName || 'JAI MEDICAL AGENCIES'} — Online Ordering`;
    renderCategories();
    renderGrid();
    renderCart();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderCategories() {
  const cats = ['All', ...new Set(state.products.map((p) => p.category).filter(Boolean))];
  $('#cats').innerHTML = cats
    .map(
      (c) =>
        `<button class="chip ${c === state.category ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`
    )
    .join('');
}

function visibleProducts() {
  const q = state.query.trim().toLowerCase();
  return state.products.filter((p) => {
    const catOk = state.category === 'All' || p.category === state.category;
    const qOk =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q);
    return catOk && qOk;
  });
}

function renderGrid() {
  const list = visibleProducts();
  $('#resultCount').textContent = list.length;
  $('#empty').hidden = list.length > 0;
  $('#grid').innerHTML = list
    .map((p) => {
      const out = p.stock <= 0;
      const max = p.stock;
      return `
      <article class="card ${out ? 'out' : ''}" data-id="${p.id}">
        <div class="card-top">
          <span class="cat-tag">${esc(p.category || 'General')}</span>
          ${stockBadge(p.stock)}
        </div>
        <h3>${esc(p.name)}</h3>
        <p class="pack">${esc(p.pack || '')}</p>
        <p class="desc">${esc(p.description || '')}</p>
        <div class="card-actions">
          <div class="stepper">
            <button type="button" data-act="dec" aria-label="Decrease">−</button>
            <input type="number" value="${out ? 0 : 1}" min="${out ? 0 : 1}" max="${max}" aria-label="Quantity">
            <button type="button" data-act="inc" aria-label="Increase">+</button>
          </div>
          <button type="button" class="btn btn-primary" data-act="add" ${out ? 'disabled' : ''}>
            ${out ? 'Unavailable' : 'Add'}
          </button>
        </div>
      </article>`;
    })
    .join('');
}

/* -------------------------------- cart -------------------------------- */

function addToCart(id, qty) {
  const prod = state.products.find((p) => p.id === id);
  if (!prod || prod.stock <= 0) return;

  qty = Math.max(1, Math.floor(qty || 1));
  const have = state.cart[id] || 0;
  const total = have + qty;

  if (total > prod.stock) {
    toast(`Only ${prod.stock} in stock for ${prod.name}`, true);
    state.cart[id] = prod.stock;
  } else {
    state.cart[id] = total;
    toast(`Added ${qty} × ${prod.name}`);
  }
  saveCart();
  renderCart();
  bumpFab();
}

function setCartQty(id, qty) {
  const prod = state.products.find((p) => p.id === id);
  if (!prod) return delete state.cart[id];
  qty = Math.floor(qty);
  if (!qty || qty <= 0) delete state.cart[id];
  else state.cart[id] = Math.min(qty, prod.stock);
  saveCart();
  renderCart();
}

function cartLines() {
  return Object.entries(state.cart)
    .map(([id, qty]) => {
      const p = state.products.find((x) => x.id === id);
      return p ? { ...p, qty } : null;
    })
    .filter(Boolean);
}

function renderCart() {
  const lines = cartLines();
  const units = lines.reduce((s, l) => s + l.qty, 0);

  $('#cartCount').textContent = units;
  $('#cartItemsLabel').textContent = `${lines.length} item${lines.length === 1 ? '' : 's'}`;
  $('#cartUnitsLabel').textContent = `${units} unit${units === 1 ? '' : 's'}`;

  $('#cartEmpty').hidden = lines.length > 0;
  $('#toCheckout').disabled = lines.length === 0;
  $('#toCheckout').textContent = lines.length ? 'Proceed to order →' : 'Add items to continue';

  $('#cartList').innerHTML = lines
    .map(
      (l) => `
      <li class="cart-item" data-id="${l.id}">
        <div class="cart-item-top">
          <div>
            <strong>${esc(l.name)}</strong>
            <small>${esc(l.pack || '')}</small>
          </div>
          <button type="button" class="remove-btn" data-act="remove">Remove</button>
        </div>
        <div class="cart-item-bot">
          <div class="qty-mini">
            <button type="button" data-act="cdec" aria-label="Decrease">−</button>
            <span>${l.qty}<span class="unit"> × pack</span></span>
            <button type="button" data-act="cinc" aria-label="Increase">+</button>
          </div>
          <span class="badge badge-ok">in stock: ${l.stock}</span>
        </div>
      </li>`
    )
    .join('');

  // checkout recap
  $('#orderRecap').innerHTML = `
    <b>Order summary</b>
    ${lines
      .map(
        (l) =>
          `<span class="line"><span>${esc(l.name)}</span><span>${l.qty} × ${esc(l.pack || 'pack')}</span></span>`
      )
      .join('')}
    <span class="line"><span><b>Total quantity</b></span><span>${units} units</span></span>`;

  saveCart();
}

function bumpFab() {
  const fab = $('#fab');
  fab.classList.remove('bump');
  void fab.offsetWidth;
  fab.classList.add('bump');
}

/* ------------------------------ drawer -------------------------------- */

function setView(view) {
  state.view = view;
  $('#cartView').hidden = view !== 'cart';
  $('#checkoutForm').hidden = view !== 'checkout';
  $('#successView').hidden = view !== 'success';

  $('#toCheckout').hidden = view !== 'cart';
  $('#placeBtn').hidden = view !== 'checkout';
  $('#backToCart').hidden = view !== 'checkout';
  $('#cartSummary').hidden = view !== 'cart';
  $('#formError').hidden = true;

  $('#drawerTitle').textContent =
    view === 'cart' ? 'Your Order' : view === 'checkout' ? 'Your Details' : 'Thank you!';
  if (view === 'checkout') $('#cName').focus();
}

function openDrawer(view = 'cart') {
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  setView(view);
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#overlay').hidden = true;
  document.body.style.overflow = '';
}

/* ------------------------------ checkout ------------------------------ */

function showFormError(msg, list) {
  const el = $('#formError');
  const lines = [...(list || []), ...(msg && !(list && list.length) ? [msg] : [])];
  el.textContent = lines.join(' ');
  el.hidden = false;
}

async function submitOrder(e) {
  e.preventDefault();
  const errBox = $('#formError');
  errBox.hidden = true;

  const customer = {
    name: $('#cName').value.trim(),
    phone: $('#cPhone').value.trim(),
    shop: $('#cShop').value.trim(),
    address: $('#cAddress').value.trim(),
    note: $('#cNote').value.trim(),
  };

  const errors = [];
  if (customer.name.length < 2) errors.push('Enter your / pharmacy name.');
  if (customer.phone.replace(/\D/g, '').length < 10) errors.push('Enter a valid 10-digit phone number.');
  if (customer.address.length < 5) errors.push('Enter the delivery address.');
  if (errors.length) return showFormError(errors.join(' '));

  const lines = cartLines();
  if (!lines.length) return showFormError('Your order is empty.');

  const btn = $('#placeBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  try {
    const data = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer,
        items: lines.map((l) => ({ id: l.id, qty: l.qty })),
      }),
    });

    // success — reset local cart, refresh stock numbers for next customer view
    state.cart = {};
    saveCart();
    $('#successOrderId').textContent = data.order.id;
    $('#checkoutForm').reset();
    setView('success');
    await loadProducts();
  } catch (e) {
    showFormError(e.message, e.list);
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }
}

/* ------------------------------- events ------------------------------- */

// grid: stepper + add
$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const act = e.target.dataset.act;
  if (!act) return;
  const input = card.querySelector('input');
  let v = parseInt(input.value, 10) || 1;
  const max = parseInt(input.max, 10) || 999;

  if (act === 'dec') input.value = Math.max(1, v - 1);
  if (act === 'inc') input.value = Math.min(max, v + 1);
  if (act === 'add') addToCart(card.dataset.id, v);
});

// categories
$('#cats').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.category = chip.dataset.cat;
  renderCategories();
  renderGrid();
});

// search
$('#search').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderGrid();
});
$('#clearFilters').addEventListener('click', () => {
  state.query = '';
  state.category = 'All';
  $('#search').value = '';
  renderCategories();
  renderGrid();
});

// cart list actions
$('#cartList').addEventListener('click', (e) => {
  const item = e.target.closest('.cart-item');
  if (!item) return;
  const act = e.target.dataset.act;
  const id = item.dataset.id;
  const cur = state.cart[id] || 0;
  if (act === 'cinc') setCartQty(id, cur + 1);
  if (act === 'cdec') setCartQty(id, cur - 1);
  if (act === 'remove') {
    delete state.cart[id];
    saveCart();
    renderCart();
    toast('Item removed');
  }
});

// drawer controls
$('#fab').addEventListener('click', () => openDrawer('cart'));
$('#closeDrawer').addEventListener('click', closeDrawer);
$('#overlay').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});
$('#toCheckout').addEventListener('click', () => setView('checkout'));
$('#backToCart').addEventListener('click', () => setView('cart'));
$('#checkoutForm').addEventListener('submit', submitOrder);
$('#continueBtn').addEventListener('click', () => {
  closeDrawer();
  setView('cart');
});

/* -------------------------------- start ------------------------------- */

$('#year').textContent = new Date().getFullYear();
loadProducts();
