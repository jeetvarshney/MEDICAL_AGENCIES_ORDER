# JAI MEDICAL AGENCIES — Wholesale Medicine Order Website

A simple website for a wholesale medicine shop. Customers see your full catalogue
**without any prices**, add medicines with quantities, and place an order. When an
order comes in, the stock quantity is automatically reduced for the next customer.

## 🌐 Live website (deployed on Netlify)

- **Shop:** https://jai-medical-agencies.netlify.app
- **Admin:** https://jai-medical-agencies.netlify.app/admin (password: `SHYAM123`)
- Data (products, orders, password) is stored in **Netlify Blobs** (cloud) — it survives redeploys.
- To publish changes: run `npx netlify deploy --prod` from this folder.

## What it does

- **Storefront** (`/`) — search & filter your medicines, add to cart, place an order with customer details.
- **Admin** (`/admin`) — add/edit/delete medicines, set stock quantities, see all orders, confirm / deliver / cancel orders (cancelling returns stock to inventory).
- **Two ways to enter stock** — add medicines one by one in the admin panel, or import a whole spreadsheet as CSV (Admin → Products → **Import CSV**). You can also **Export CSV** to edit in Excel and re-import.
- **No prices anywhere** — rates are confirmed by phone after the order is placed.
- Stock is deducted instantly when an order is placed; out-of-stock medicines cannot be ordered.

## How to run locally

1. Install **Node.js** (any recent version — https://nodejs.org).
2. Open a command prompt in this folder and run:

```
npm install
npm start
```

3. Open the shop: **http://localhost:3000**
4. Open the admin panel: **http://localhost:3000/admin** — password: **SHYAM123**

## Deploying updates to the live site

```
npx netlify deploy --prod
```

Your login is remembered; this uploads changes and goes live in ~1 minute.
Note: locally you edit `data/*.json`, but the **live site keeps its own copy in
Netlify Blobs** — manage the live catalogue from the live Admin page (or CSV import).

## Data files (in the `data/` folder)

- `products.json` — your medicine catalogue + stock quantities
- `orders.json` — every order you receive
- `config.json` — shop name (shown to customers), admin password, low-stock alert level

**Backup tip:** copy the whole `data/` folder regularly; it holds all your important information.

## CSV spreadsheet import / export

Admin → **Products** tab:

- **⬆ Import CSV** — upload a `.csv` file (make one in Excel and "Save as CSV").
  Columns in the first row: `name, category, pack, description, stock`
  - A row whose `name` matches an existing medicine → its stock/details are **updated**
  - A new name → the medicine is **added**
  - `category`, `pack`, `description` are optional; only `name` and `stock` are required.
- **⬇ Export CSV** — downloads your whole catalogue so you can edit quantities in Excel
  and re-import later.

Example file (`medicines.csv`):

```
name,category,pack,description,stock
Paracetamol 500 mg,Tablets,Strip of 15 tablets,Fever & pain relief,480
Cough Syrup 100 ml,Syrups,Bottle of 100 ml,Dry & wet cough,140
```

## Going live for customers

**Already done** — the site is live at https://jai-medical-agencies.netlify.app.

Your Netlify site (managed from https://app.netlify.com/projects/jai-medical-agencies):

- **Change the admin password** from the live Admin → Settings immediately.
- **Add your real medicines** on the live Admin → Products page (or import a CSV).
- The two cancelled orders in the admin list (`Live Test`, `Final Check`) were my
  deployment tests — safe to ignore.

### Local vs live data

- **Local** (`npm start`): data in `data/*.json` on your PC.
- **Live (Netlify)**: data in Netlify Blobs — separate from your PC.
  Manage it through the live Admin page.

## Tips

- The first time it runs, 24 sample medicines are added so you can see how it looks.
  Delete or edit them from the Admin → Products page.
- Change your phone number shown in the header: edit `public/index.html` (search for `99270`).
- Blocked quantities: if a customer tries to order more than you have, they see "only X left".