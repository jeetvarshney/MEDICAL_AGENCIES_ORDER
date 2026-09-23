/* MediWholesale — admin panel logic */

const $ = (s) => document.querySelector(s);

const TOKEN_KEY = 'mws_token';

const state = {
  products: [],
  orders: [],
  stats: {},
  lowStockAt: 50,
  shopName: '',
  orderFilter: 'all',
  editingId: null,
};

/* ------------------------------ helpers ------------------------------ */

let toastTimer;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': localStorage.getItem(TOKEN_KEY) || '',
    },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showLogin();
    throw new Error(data.error || 'Please login again.');
  }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.list = data.errors;
    throw err;
  }
  return data;
}

function statusPill(s) {
  return `<span class="pill ${esc(s)}">${esc(s)}</span>`;
}

/* ------------------------------- auth -------------------------------- */

function showLogin() {
  $('#loginView').hidden = false;
  $('#appView').hidden = true;
  localStorage.removeItem(TOKEN_KEY);
  $('#loginPassword').value = '';
}

function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').hidden = true;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#loginPassword').value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    localStorage.setItem(TOKEN_KEY, data.token);
    showApp();
    await refresh();
    toast('Welcome back!');
  } catch (err) {
    $('#loginError').textContent = err.message;
    $('#loginError').hidden = false;
  }
});

$('#logoutBtn').addEventListener('click', showLogin);

/* ------------------------------- data -------------------------------- */

async function refresh() {
  try {
    const data = await api('/api/admin/data');
    state.products = data.products;
    state.orders = data.orders;
    state.stats = data.stats;
    state.lowStockAt = data.lowStockAt;
    state.shopName = data.shopName;
    renderAll();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderAll() {
  $('#shopName').textContent = state.shopName;

  const s = state.stats;
  $('#stPending').textContent = s.pending || 0;
  $('#stToday').textContent = s.todayOrders || 0;
  $('#stTotal').textContent = s.totalOrders || 0;
  $('#stProducts').textContent = s.productCount || 0;
  $('#stUnits').textContent = s.totalUnits || 0;
  $('#stLow').textContent = s.lowStock || 0;

  const pill = $('#pendingPill');
  pill.hidden = !(s.pending > 0);
  pill.textContent = s.pending || 0;

  renderLowStock();
  renderOrders();
  renderProducts();
  renderSettings();
}

function renderLowStock() {
  const low = state.products
    .filter((p) => (Number(p.stock) || 0) <= state.lowStockAt)
    .sort((a, b) => a.stock - b.stock);

  $('#lowEmpty').hidden = low.length > 0;
  $('#lowList').innerHTML = low
    .map(
      (p) => `
      <li>
        <span>${esc(p.name)} <span class="muted">· ${esc(p.pack || '')}</span></span>
        <b class="${p.stock <= 0 ? 'stock-out' : 'stock-low'}">${p.stock} left</b>
      </li>`
    )
    .join('');
}

function renderSettings() {
  $('#setShopName').value = state.shopName || '';
  $('#setLowStock').value = state.lowStockAt;
}

/* ------------------------------ products ------------------------------ */

function renderProducts() {
  const cats = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
  $('#catList').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');

  $('#productRows').innerHTML = state.products
    .map((p) => {
      const cls = p.stock <= 0 ? 'stock-out' : p.stock <= state.lowStockAt ? 'stock-low' : '';
      return `
      <tr data-id="${p.id}">
        <td><b>${esc(p.name)}</b><span class="sub">${esc(p.description || '')}</span></td>
        <td>${esc(p.category || 'General')}</td>
        <td>${esc(p.pack || '—')}</td>
        <td><span class="stock-num ${cls}">${p.stock}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-act="stock">Set qty</button>
            <button class="btn btn-ghost btn-sm" data-act="edit">Edit</button>
            <button class="btn btn-danger btn-sm" data-act="del">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

function openModal(product = null) {
  state.editingId = product ? product.id : null;
  $('#modalTitle').textContent = product ? 'Edit medicine' : 'Add medicine';
  $('#pName').value = product?.name || '';
  $('#pCategory').value = product?.category || '';
  $('#pPack').value = product?.pack || '';
  $('#pDesc').value = product?.description || '';
  $('#pStock').value = product ? product.stock : '';
  $('#productError').hidden = true;
  $('#productModal').hidden = false;
  setTimeout(() => $('#pName').focus(), 50);
}

function closeModal() {
  $('#productModal').hidden = true;
  state.editingId = null;
}

$('#addProductBtn').addEventListener('click', () => openModal());
$('#modalClose').addEventListener('click', closeModal);
$('#modalCancel').addEventListener('click', closeModal);
$('#productModal').addEventListener('click', (e) => {
  if (e.target === $('#productModal')) closeModal();
});

$('#productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    id: state.editingId,
    name: $('#pName').value.trim(),
    category: $('#pCategory').value.trim(),
    pack: $('#pPack').value.trim(),
    description: $('#pDesc').value.trim(),
    stock: $('#pStock').value,
  };
  try {
    if (state.editingId) {
      await api('/api/admin/products', { method: 'PUT', body: JSON.stringify(payload) });
      toast('Medicine updated');
    } else {
      await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
      toast('Medicine added');
    }
    closeModal();
    await refresh();
  } catch (err) {
    $('#productError').textContent = [err.message, ...(err.list || [])].join(' ');
    $('#productError').hidden = false;
  }
});

$('#productRows').addEventListener('click', async (e) => {
  const row = e.target.closest('tr');
  const act = e.target.dataset.act;
  if (!row || !act) return;
  const prod = state.products.find((p) => p.id === row.dataset.id);
  if (!prod) return;

  if (act === 'edit') openModal(prod);

  if (act === 'stock') {
    const next = prompt(`Set stock quantity for:\n${prod.name}`, String(prod.stock));
    if (next === null) return;
    const qty = Math.floor(Number(next));
    if (!Number.isFinite(qty) || qty < 0) return toast('Invalid quantity.', true);
    try {
      await api('/api/admin/products', {
        method: 'PUT',
        body: JSON.stringify({ ...prod, stock: qty }),
      });
      toast('Stock updated');
      await refresh();
    } catch (err) {
      toast(err.message, true);
    }
  }

  if (act === 'del') {
    if (!confirm(`Delete "${prod.name}" from the catalogue?`)) return;
    try {
      await api(`/api/admin/products?id=${encodeURIComponent(prod.id)}`, { method: 'DELETE' });
      toast('Medicine deleted');
      await refresh();
    } catch (err) {
      toast(err.message, true);
    }
  }
});

/* ---------------------------- CSV import/export -------------------------- */

$('#importCsvBtn').addEventListener('click', () => $('#csvFile').click());

$('#csvFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5_000_000) return toast('File is too large (max 5 MB).', true);

  try {
    const csv = await file.text();
    toast('Importing…');
    const res = await api('/api/admin/products/import', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
    const parts = [];
    if (res.added) parts.push(`${res.added} added`);
    if (res.updated) parts.push(`${res.updated} updated`);
    toast(`Import done: ${parts.join(', ') || 'no changes'}`);
    if (res.errors && res.errors.length) {
      console.warn('CSV row errors:', res.errors);
      toast(`Imported, but ${res.errors.length} row(s) skipped — see console.`, true);
    }
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#exportCsvBtn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/products/export', {
      headers: { 'x-auth-token': localStorage.getItem(TOKEN_KEY) || '' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medicines-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Catalogue downloaded');
  } catch (err) {
    toast(err.message, true);
  }
});

/* -------------------------------- orders ------------------------------- */

function renderOrders() {
  const list =
    state.orderFilter === 'all'
      ? state.orders
      : state.orders.filter((o) => o.status === state.orderFilter);

  $('#ordersEmpty').hidden = list.length > 0;

  $('#ordersList').innerHTML = list
    .map((o) => {
      const c = o.customer || {};
      const actions = [];
      if (o.status === 'pending') {
        actions.push(`<button class="btn btn-primary btn-sm" data-act="confirmed">✓ Confirm</button>`);
        actions.push(`<button class="btn btn-danger btn-sm" data-act="cancelled">Cancel</button>`);
      } else if (o.status === 'confirmed') {
        actions.push(`<button class="btn btn-primary btn-sm" data-act="delivered">🚚 Mark delivered</button>`);
        actions.push(`<button class="btn btn-danger btn-sm" data-act="cancelled">Cancel</button>`);
      } else if (o.status === 'cancelled') {
        actions.push(`<button class="btn btn-ghost btn-sm" data-act="pending">Restore</button>`);
      } else {
        actions.push(`<button class="btn btn-ghost btn-sm" data-act="confirmed">Reopen</button>`);
      }

      return `
      <article class="order-card ${o.status === 'cancelled' ? 'is-cancelled' : ''}" data-id="${o.id}">
        <div class="order-head">
          <div class="order-head-left">
            <span class="order-id-strong">${esc(o.id)}</span>
            ${statusPill(o.status)}
            <span class="order-time">🕒 ${fmtDate(o.createdAt)}</span>
          </div>
          <div class="order-actions">${actions.join('')}</div>
        </div>
        <div class="order-body">
          <div class="cust-line">
            <b>${esc(c.name || '')}</b>
            ${c.shop ? `<span class="sep">|</span> ${esc(c.shop)}` : ''}
            <span class="sep">|</span> 📞 <a href="tel:${esc(c.phone || '')}" style="color:var(--brand-dark);font-weight:700">${esc(c.phone || '')}</a>
          </div>
          <div class="cust-addr">📍 ${esc(c.address || '')}</div>
          ${c.note ? `<div class="order-note">📝 ${esc(c.note)}</div>` : ''}
          <ul class="order-items">
            ${o.items
              .map(
                (i) => `
              <li>
                <span>${esc(i.name)} <span class="muted">· ${esc(i.pack || '')}</span></span>
                <span class="qty">${i.qty} × pack</span>
              </li>`
              )
              .join('')}
          </ul>
          <div class="order-total">Total quantity: <b>${o.totalUnits} units</b></div>
        </div>
      </article>`;
    })
    .join('');
}

$('#orderFilters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.orderFilter = chip.dataset.filter;
  $('#orderFilters').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  renderOrders();
});

$('#ordersList').addEventListener('click', async (e) => {
  const card = e.target.closest('.order-card');
  const act = e.target.dataset.act;
  if (!card || !act) return;

  if (act === 'cancelled' && !confirm(`Cancel order ${card.dataset.id}?\nStock will be returned to inventory.`))
    return;

  try {
    await api('/api/admin/orders/status', {
      method: 'POST',
      body: JSON.stringify({ orderId: card.dataset.id, status: act }),
    });
    toast(`Order ${card.dataset.id} → ${act}`);
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ------------------------------- settings ------------------------------ */

$('#shopForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({
        shopName: $('#setShopName').value.trim(),
        lowStock: $('#setLowStock').value,
      }),
    });
    toast('Shop details saved');
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: $('#curPass').value,
        newPassword: $('#newPass').value,
      }),
    });
    toast('Password changed ✓');
    $('#passwordForm').reset();
  } catch (err) {
    toast(err.message, true);
  }
});

/* --------------------------------- tabs -------------------------------- */

$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  $('#tabs').querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
  ['dashboard', 'orders', 'products', 'settings'].forEach((name) => {
    $(`#tab-${name}`).hidden = tab.dataset.tab !== name;
  });
});

/* --------------------------------- boot -------------------------------- */

(async function init() {
  if (localStorage.getItem(TOKEN_KEY)) {
    showApp();
    await refresh();
  } else {
    showLogin();
  }
})();

// keep data fresh (stock changes when orders come in from customers)
setInterval(() => {
  if (!$('#appView').hidden) refresh();
}, 30000);
