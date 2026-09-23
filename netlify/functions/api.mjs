/**
 * JAI MEDICAL AGENCIES — Netlify Function (Functions API v2).
 *
 * Handles every /api/* request. Data lives in a Netlify Blob store
 * named "shop-data" (persistent cloud storage) — credentials are
 * injected automatically by the Netlify runtime in v2 functions.
 */

import { getStore } from '@netlify/blobs';
import lib from '../../lib/api.js';

const { createHandler, MAX_BODY_BYTES } = lib;

// Netlify injects credentials per invocation and they expire, so resolve a
// fresh store on every access instead of capturing one at cold start.
// "strong" consistency: every read hits the origin, so stock quantities
// are always current (eventual consistency would show stale counts).
function blobStore() {
  return getStore({ name: 'shop-data', consistency: 'strong' });
}

const store = {
  async get(key) {
    const raw = await blobStore().get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    await blobStore().set(key, JSON.stringify(value));
  },
};

const handle = createHandler(store);

export default async (request) => {
  const url = new URL(request.url);

  let rawBody = '';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ ok: false, error: 'Request too large.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }

  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  try {
    const out = await handle({
      method: request.method,
      pathname: url.pathname,
      searchParams: url.searchParams,
      headers,
      rawBody,
    });
    return new Response(out.body || '', { status: out.status, headers: out.headers });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
};

export const config = { path: '/api/*' };
