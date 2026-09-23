'use strict';

/**
 * JAI MEDICAL AGENCIES — local server (run with: node server.js)
 *
 *   Storefront: http://localhost:3000
 *   Admin:      http://localhost:3000/admin   (password: admin123)
 *
 * Data is stored in ./data/*.json — back up that folder.
 * The same app deploys to Netlify (see netlify.toml), where data
 * is stored in Netlify Blobs instead.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createHandler, fsStore, MAX_BODY_BYTES } = require('./lib/api');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

const handle = createHandler(fsStore(DATA_DIR));

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request too large.'), { status: 400 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ------------------------------ static files ------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

function serveStatic(res, pathname) {
  let rel = pathname.slice(1);
  if (pathname === '/') rel = 'index.html';
  else if (pathname === '/admin' || pathname === '/admin/') rel = 'admin.html';

  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    return sendJSON(res, 403, { ok: false, error: 'Forbidden' });
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      return sendJSON(res, 404, { ok: false, error: 'Not found' });
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* -------------------------------- server --------------------------------- */

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendJSON(res, 400, { ok: false, error: 'Bad request.' });
  }

  if (url.pathname.startsWith('/api/')) {
    try {
      const rawBody =
        req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
      const out = await handle({
        method: req.method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        headers: req.headers,
        rawBody,
      });
      res.writeHead(out.status, {
        ...out.headers,
        'Content-Length': Buffer.byteLength(out.body || ''),
      });
      res.end(out.body || '');
    } catch (err) {
      sendJSON(res, err.status || 500, { ok: false, error: err.message || 'Server error' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
  }
  serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log('--------------------------------------------');
  console.log('  JAI MEDICAL AGENCIES is running (local)');
  console.log(`  Shop   : http://localhost:${PORT}`);
  console.log(`  Admin  : http://localhost:${PORT}/admin`);
  console.log('  Stop   : Ctrl+C');
  console.log('--------------------------------------------');
});
