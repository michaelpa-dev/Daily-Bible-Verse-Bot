const http = require('node:http');
const { URL } = require('node:url');

const { logger } = require('../logger.js');
const { handleRandomWebVerse } = require('./scriptureApi.js');

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

function sendNotFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

function parseOffset(query) {
  if (!query.has('offset')) {
    return undefined;
  }
  const raw = query.get('offset');
  if (raw == null || raw.trim().length === 0) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0 || value > Number.MAX_SAFE_INTEGER) {
    return undefined;
  }
  return Math.floor(value);
}

function createHttpServer(options = {}) {
  const fetchImpl = options.fetchImpl;
  const getHealthSnapshot =
    typeof options.getHealthSnapshot === 'function' ? options.getHealthSnapshot : null;
  const isReady = typeof options.isReady === 'function' ? options.isReady : () => false;

  return http.createServer(async (req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    if (method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/readyz') {
      const ready = Boolean(isReady());
      const snapshot = getHealthSnapshot ? getHealthSnapshot() : null;
      sendJson(res, ready ? 200 : 503, { ok: ready, ready, snapshot });
      return;
    }

    const match = pathname.match(/^\/data\/web\/random\/([^/]+)$/i);
    if (match) {
      const scope = match[1];
      try {
        const { status, body } = await handleRandomWebVerse(scope, {
          fetchImpl,
          offset: parseOffset(url.searchParams),
        });
        sendJson(res, status, body);
        return;
      } catch (error) {
        logger.error('API error', error);
        sendJson(res, 500, { error: 'Internal server error' });
        return;
      }
    }

    sendNotFound(res);
  });
}

module.exports = {
  createHttpServer,
};
