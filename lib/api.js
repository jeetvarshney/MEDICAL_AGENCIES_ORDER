'use strict';

/**
 * JAI MEDICAL AGENCIES — shared API handler.
 *
 * Used by:
 *   - server.js          (local run, stores data in ./data/*.json)
 *   - netlify/functions/ (deployed on Netlify, stores data in Netlify Blobs)
 *
 * The storage backend ("store") only needs two async methods:
 *   get(key) -> Promise<object | null>     keys: 'products' | 'orders' | 'config'
 *   set(key, value) -> Promise<void>
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // admin stays logged in 12h
const MAX_BODY_BYTES = 6 * 1024 * 1024;

const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];
const CSV_COLUMNS = ['name', 'category', 'pack', 'description', 'stock'];

const DEFAULT_CONFIG = {
  shopName: 'JAI MEDICAL AGENCIES',
  adminPassword: 'admin123',
  lowStock: 50,
};

const SEED_PRODUCTS = [
  { name: 'Paracetamol 500 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 480, description: 'Fever & pain relief' },
  { name: 'Dolo 650 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 360, description: 'Fever & pain relief' },
  { name: 'Ibuprofen 400 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 300, description: 'Pain & inflammation' },
  { name: 'Azithromycin 500 mg', category: 'Tablets', pack: 'Strip of 5 tablets', stock: 200, description: 'Antibiotic course' },
  { name: 'Amoxicillin + Clavulanate 625 mg', category: 'Tablets', pack: 'Strip of 10 tablets', stock: 170, description: 'Antibiotic' },
  { name: 'Cetirizine 10 mg', category: 'Tablets', pack: 'Strip of 10 tablets', stock: 520, description: 'Allergy relief' },
  { name: 'Levocetirizine 5 mg', category: 'Tablets', pack: 'Strip of 10 tablets', stock: 260, description: 'Allergy relief' },
  { name: 'Pantoprazole 40 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 280, description: 'Acidity & gas' },
  { name: 'Omeprazole 20 mg', category: 'Capsules', pack: 'Strip of 15 capsules', stock: 240, description: 'Acidity & gas' },
  { name: 'Metformin 500 mg', category: 'Tablets', pack: 'Strip of 20 tablets', stock: 260, description: 'Diabetes care' },
  { name: 'Telmisartan 40 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 220, description: 'Blood pressure' },
  { name: 'Atorvastatin 10 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 240, description: 'Cholesterol' },
  { name: 'Amlodipine 5 mg', category: 'Tablets', pack: 'Strip of 15 tablets', stock: 250, description: 'Blood pressure' },
  { name: 'Ondansetron 4 mg', category: 'Tablets', pack: 'Strip of 10 tablets', stock: 110, description: 'Vomiting relief' },
  { name: 'Vitamin C 1000 mg', category: 'Tablets', pack: 'Jar of 30 tablets', stock: 120, description: 'Immunity booster' },
  { name: 'Multivitamin Tablets', category: 'Tablets', pack: 'Jar of 30 tablets', stock: 130, description: 'Daily nutrition' },
  { name: 'ORS Sachet (Lemon)', category: 'Sachets', pack: 'Box of 20 sachets', stock: 150, description: 'Dehydration' },
  { name: 'Cough Syrup 100 ml', category: 'Syrups', pack: 'Bottle of 100 ml', stock: 140, description: 'Dry & wet cough' },
  { name: 'Paracetamol Syrup 60 ml', category: 'Syrups', pack: 'Bottle of 60 ml', stock: 160, description: 'Kids fever' },
  { name: 'Betadine Solution 100 ml', category: 'Topical', pack: 'Bottle of 100 ml', stock: 90, description: 'Antiseptic' },
  { name: 'Diclofenac Gel 30 g', category: 'Topical', pack: 'Tube of 30 g', stock: 110, description: 'Pain relief gel' },
  { name: 'Digital Thermometer', category: 'Devices', pack: 'Single piece', stock: 70, description: 'Fever check' },
  { name: 'N95 Mask', category: 'Devices', pack: 'Box of 20 masks', stock: 80, description: 'Protection' },
  { name: 'Insulin Syringe', category: 'Devices', pack: 'Box of 100 syringes', stock: 60, description: 'Diabetes care' },
];

class ValidationError extends Error {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(list[0]);
    this.status = 400;
    this.errors = list;
  }
}

function seedProducts() {
  const now = new Date().toISOString();
  return SEED_PRODUCTS.map((p) => ({
    id: 'p_' + crypto.randomBytes(5).toString('hex'),
    name: p.name,
    category: p.category,
    pack: p.pack,
    description: p.description || '',
    stock: p.stock,
    updatedAt: now,
  }));
}

/* --------------------------- filesystem store ---------------------------- */

const FS_FILES = { products: 'products.json', orders: 'orders.json', config: 'config.json' };

function fsStore(dir) {
  return {
    async get(key) {
      const file = path.join(dir, FS_FILES[key]);
      if (!fs.existsSync(file)) return null;
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        console.error(`[warn] could not read ${path.basename(file)}: ${err.message}`);
        return null;
      }
    },
    async set(key, value) {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, FS_FILES[key]);
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
      fs.renameSync(tmp, file);
    },
  };
}

/* -------------------------------- CSV ------------------------------------ */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}

function csvFromProducts(products) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(',')];
  for (const p of products) {
    lines.push([p.name, p.category, p.pack, p.description, p.stock].map(cell).join(','));
  }
  return lines.join('\r\n');
}

function importProductsCSV(text, products) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new ValidationError(['The file has no data rows.']);

  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (name) => header.indexOf(name);
  const nameIdx = col('name');
  const stockIdx = col('stock');

  if (nameIdx === -1) {
    throw new ValidationError(['The first row must be a header containing at least "name" and "stock".']);
  }
  if (stockIdx === -1) {
    throw new ValidationError(['The header row must contain a "stock" column.']);
  }

  const errors = [];
  let added = 0;
  let updated = 0;
  const now = new Date().toISOString();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = String(r[nameIdx] || '').trim().slice(0, 120);
    const stock = Math.floor(Number(String(r[stockIdx] || '').replace(/[^\d.-]/g, '')));

    if (!name) { errors.push(`Row ${line}: medicine name is missing.`); return; }
    if (!Number.isFinite(stock) || stock < 0) { errors.push(`Row ${line}: stock for "${name}" is not a valid quantity.`); return; }

    const get = (c) => (col(c) === -1 ? '' : String(r[col(c)] || '').trim());
    const patch = {
      name,
      category: get('category').slice(0, 60) || 'General',
      pack: get('pack').slice(0, 80),
      description: get('description').slice(0, 200),
      stock,
      updatedAt: now,
    };

    const existing = products.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      Object.assign(existing, patch, { id: existing.id });
      updated++;
    } else {
      products.push({ id: 'p_' + crypto.randomBytes(5).toString('hex'), ...patch });
      added++;
    }
  });

  if (errors.length && added === 0 && updated === 0) {
    throw new ValidationError(errors.slice(0, 5));
  }

  return { added, updated, errors };
}

function adminStats(products, orders, config) {
  const today = new Date().toDateString();
  const lowAt = Number(config.lowStock) || 50;
  return {
    productCount: products.length,
    totalUnits: products.reduce((s, p) => s + (Number(p.stock) || 0), 0),
    pending: orders.filter((o) => o.status === 'pending').length,
    todayOrders: orders.filter((o) => new Date(o.createdAt).toDateString() === today).length,
    lowStock: products.filter((p) => (Number(p.stock) || 0) <= lowAt).length,
    lowStockAt: lowAt,
    totalOrders: orders.length,
  };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function parseBody(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError(['Invalid request body.']);
  }
}

/* ------------------------------ the handler ------------------------------ */

function createHandler(store) {
  const json = (status, payload) => ({
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const getJSON = async (key, fallback) => {
    const v = await store.get(key);
    return v == null ? fallback : v;
  };

  let ready = false;
  async function init() {
    if (ready) return;
    let cfg = await store.get('config');
    if (cfg == null) {
      cfg = { ...DEFAULT_CONFIG };
      await store.set('config', cfg);
    }
    if (await store.get('products') == null) {
      await store.set('products', seedProducts());
      console.log('[init] Seeded sample medicines — edit them from the Admin page.');
    }
    if (await store.get('orders') == null) await store.set('orders', []);
    if (!cfg.sessionSecret) {
      cfg.sessionSecret = crypto.randomBytes(24).toString('hex');
      await store.set('config', cfg);
    }
    ready = true;
  }

  /* --- stateless admin session tokens (work across serverless instances) --- */

  function sessionKey(cfg) {
    return crypto
      .createHash('sha256')
      .update(String(cfg.sessionSecret || '') + '\u0000' + String(cfg.adminPassword))
      .digest();
  }

  function issueToken(cfg) {
    const exp = Date.now() + SESSION_TTL_MS;
    const expStr = String(exp);
    const sig = crypto.createHmac('sha256', sessionKey(cfg)).update(expStr).digest('base64url');
    return { token: `${expStr}.${sig}`, expiresAt: exp };
  }

  function tokenValid(cfg, token) {
    if (typeof token !== 'string') return false;
    const i = token.indexOf('.');
    if (i < 1) return false;
    const expStr = token.slice(0, i);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    const want = crypto.createHmac('sha256', sessionKey(cfg)).update(expStr).digest();
    const got = Buffer.from(token.slice(i + 1), 'base64url');
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  }

  function tokenFrom(headers) {
    return (
      headers['x-auth-token'] ||
      String(headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      ''
    );
  }

  /* --------------------------- business actions -------------------------- */

  async function createOrder(payload) {
    const errors = [];
    const customer = {
      name: String(payload?.customer?.name || '').trim().slice(0, 80),
      phone: String(payload?.customer?.phone || '').replace(/\D/g, '').slice(0, 15),
      shop: String(payload?.customer?.shop || '').trim().slice(0, 100),
      address: String(payload?.customer?.address || '').trim().slice(0, 300),
      note: String(payload?.customer?.note || '').trim().slice(0, 500),
    };

    if (customer.name.length < 2) errors.push('Customer name is required.');
    if (customer.phone.length < 10) errors.push('A valid phone number is required.');
    if (customer.address.length < 5) errors.push('Delivery address is required.');

    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    if (rawItems.length === 0) errors.push('Your cart is empty.');
    if (errors.length) throw new ValidationError(errors);

    const products = await getJSON('products', []);
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = [];

    for (const raw of rawItems) {
      const qty = Math.floor(Number(raw.qty));
      const prod = byId.get(raw.id);
      if (!prod) {
        throw new ValidationError(['A medicine in your cart is no longer available. Please refresh.']);
      }
      if (!Number.isFinite(qty) || qty < 1) {
        throw new ValidationError([`Invalid quantity for ${prod.name}.`]);
      }
      if (qty > prod.stock) {
        throw new ValidationError([`${prod.name}: only ${prod.stock} left in stock.`]);
      }
      items.push({ id: prod.id, name: prod.name, pack: prod.pack, category: prod.category, qty });
    }

    // --- deduct stock so the next customer sees the reduced quantity ---
    const now = new Date().toISOString();
    for (const item of items) {
      const prod = byId.get(item.id);
      prod.stock -= item.qty;
      prod.updatedAt = now;
    }

    const orders = await getJSON('orders', []);
    const nextNum =
      orders.reduce((max, o) => {
        const n = parseInt(String(o.id).replace(/\D/g, ''), 10);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 1000) + 1;

    const order = {
      id: `ORD-${nextNum}`,
      createdAt: now,
      status: 'pending',
      customer,
      items,
      totalUnits: items.reduce((sum, i) => sum + i.qty, 0),
    };

    orders.push(order);
    await store.set('products', products);
    await store.set('orders', orders);
    console.log(`[order] ${order.id} — ${order.customer.name}, ${order.totalUnits} units`);
    return order;
  }

  async function setOrderStatus(orderId, status) {
    if (!ORDER_STATUSES.includes(status)) throw new ValidationError(['Invalid order status.']);

    const orders = await getJSON('orders', []);
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw new ValidationError(['Order not found.']);

    const wasCancelled = order.status === 'cancelled';
    const nowCancelled = status === 'cancelled';

    if (nowCancelled && !wasCancelled) {
      // Return the reserved stock to the shelf.
      const products = await getJSON('products', []);
      for (const item of order.items) {
        const prod = products.find((p) => p.id === item.id);
        if (prod) prod.stock += item.qty;
      }
      await store.set('products', products);
    } else if (wasCancelled && !nowCancelled) {
      // Un-cancelling: take the stock back out of inventory.
      const products = await getJSON('products', []);
      for (const item of order.items) {
        const prod = products.find((p) => p.id === item.id);
        if (!prod) throw new ValidationError([`${item.name} is no longer in the catalogue.`]);
        if (prod.stock < item.qty) {
          throw new ValidationError([`Not enough stock of ${item.name} (available: ${prod.stock}).`]);
        }
      }
      for (const item of order.items) {
        products.find((p) => p.id === item.id).stock -= item.qty;
      }
      await store.set('products', products);
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();
    await store.set('orders', orders);
    console.log(`[order] ${order.id} -> ${order.status}`);
    return order;
  }

  /* ------------------------------- routing ------------------------------- */

  async function handle(req) {
    await init();
    const method = req.method || 'GET';
    const pathname = req.pathname || '/';
    const search = req.searchParams || new URLSearchParams();
    const headers = req.headers || {};
    const rawBody = String(req.rawBody || '');

    try {
      if (rawBody.length > MAX_BODY_BYTES) {
        return json(400, { ok: false, error: 'Request too large.' });
      }
      if (!pathname.startsWith('/api/')) {
        return json(404, { ok: false, error: 'Not found.' });
      }

      const key = `${method} ${pathname}`;
      const cfg = await getJSON('config', DEFAULT_CONFIG);

      /* ---- public ---- */
      if (key === 'GET /api/products') {
        const products = await getJSON('products', []);
        return json(200, { ok: true, shopName: cfg.shopName, products });
      }

      if (key === 'POST /api/orders') {
        const order = await createOrder(parseBody(rawBody));
        return json(201, { ok: true, order });
      }

      if (key === 'POST /api/admin/login') {
        const body = parseBody(rawBody);
        if (!safeEqual(body.password, cfg.adminPassword)) {
          return json(401, { ok: false, error: 'Wrong password. Try again.' });
        }
        const { token, expiresAt } = issueToken(cfg);
        return json(200, { ok: true, token, expiresAt });
      }

      /* ---- admin (auth required) ---- */
      if (pathname.startsWith('/api/admin/')) {
        if (!tokenValid(cfg, tokenFrom(headers))) {
          return json(401, { ok: false, error: 'Session expired. Please login again.' });
        }

        if (key === 'GET /api/admin/data') {
          const products = await getJSON('products', []);
          const orders = (await getJSON('orders', []))
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return json(200, {
            ok: true,
            shopName: cfg.shopName,
            lowStockAt: Number(cfg.lowStock) || 50,
            products,
            orders,
            stats: adminStats(products, orders, cfg),
          });
        }

        if (key === 'POST /api/admin/products' || key === 'PUT /api/admin/products') {
          const body = parseBody(rawBody);
          const errors = [];
          const name = String(body.name || '').trim().slice(0, 120);
          const category = String(body.category || '').trim().slice(0, 60) || 'General';
          const pack = String(body.pack || '').trim().slice(0, 80);
          const description = String(body.description || '').trim().slice(0, 200);
          const stock = Math.floor(Number(body.stock));

          if (name.length < 2) errors.push('Medicine name is required.');
          if (!Number.isFinite(stock) || stock < 0) errors.push('Stock must be 0 or more.');
          if (errors.length) throw new ValidationError(errors);

          const products = await getJSON('products', []);

          if (key === 'PUT /api/admin/products') {
            const prod = products.find((p) => p.id === body.id);
            if (!prod) throw new ValidationError(['Product not found.']);
            Object.assign(prod, { name, category, pack, description, stock, updatedAt: new Date().toISOString() });
            await store.set('products', products);
            return json(200, { ok: true, product: prod });
          }

          const prod = {
            id: 'p_' + crypto.randomBytes(5).toString('hex'),
            name, category, pack, description, stock,
            updatedAt: new Date().toISOString(),
          };
          products.push(prod);
          await store.set('products', products);
          return json(201, { ok: true, product: prod });
        }

        if (key === 'DELETE /api/admin/products') {
          const id = search.get('id');
          const products = await getJSON('products', []);
          const idx = products.findIndex((p) => p.id === id);
          if (idx === -1) throw new ValidationError(['Product not found.']);
          const [removed] = products.splice(idx, 1);
          await store.set('products', products);
          return json(200, { ok: true, removed });
        }

        if (key === 'GET /api/admin/products/export') {
          const csv = csvFromProducts(await getJSON('products', []));
          return {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="medicines-${new Date().toISOString().slice(0, 10)}.csv"`,
            },
            body: '\uFEFF' + csv,
          };
        }

        if (key === 'POST /api/admin/products/import') {
          const body = parseBody(rawBody);
          const text = String(body.csv || '');
          if (!text.trim()) throw new ValidationError(['Please choose a CSV file first.']);
          if (text.length > 5_000_000) throw new ValidationError(['File is too large (max 5 MB).']);
          const products = await getJSON('products', []);
          const result = importProductsCSV(text, products);
          if (result.added || result.updated) await store.set('products', products);
          console.log(`[import] +${result.added} added, ~${result.updated} updated`);
          return json(200, { ok: true, ...result });
        }

        if (key === 'POST /api/admin/orders/status') {
          const body = parseBody(rawBody);
          const order = await setOrderStatus(String(body.orderId || ''), String(body.status || ''));
          return json(200, { ok: true, order });
        }

        if (key === 'POST /api/admin/settings') {
          const body = parseBody(rawBody);
          const shopName = String(body.shopName || '').trim().slice(0, 80);
          if (shopName.length < 2) throw new ValidationError(['Shop name is required.']);
          const next = { ...cfg, shopName };
          if (body.lowStock !== undefined) {
            const low = Math.floor(Number(body.lowStock));
            if (Number.isFinite(low) && low >= 0) next.lowStock = low;
          }
          await store.set('config', next);
          return json(200, { ok: true, shopName: next.shopName, lowStock: next.lowStock });
        }

        if (key === 'POST /api/admin/password') {
          const body = parseBody(rawBody);
          if (!safeEqual(body.currentPassword, cfg.adminPassword)) {
            throw new ValidationError(['Current password is wrong.']);
          }
          const next = String(body.newPassword || '');
          if (next.length < 6) throw new ValidationError(['New password must be at least 6 characters.']);
          await store.set('config', { ...cfg, adminPassword: next });
          return json(200, { ok: true });
        }

        return json(404, { ok: false, error: 'Unknown admin route.' });
      }

      return json(404, { ok: false, error: 'Unknown API route.' });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return json(status, {
        ok: false,
        error: err.message || 'Server error',
        errors: err.errors,
      });
    }
  }

  return handle;
}

module.exports = { createHandler, fsStore, MAX_BODY_BYTES, DEFAULT_CONFIG };
