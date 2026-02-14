const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 20 * 60 * 1000;
const MAX_SESSIONS = 1000;

const sessions = new Map();

function createSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

function sweepExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions.entries()) {
    if (!session || typeof session.expiresAt !== 'number' || now > session.expiresAt) {
      sessions.delete(id);
    }
  }
}

function pruneToMaxSessions() {
  if (sessions.size <= MAX_SESSIONS) {
    return;
  }

  // Map preserves insertion order; delete oldest sessions first.
  const overflow = sessions.size - MAX_SESSIONS;
  let removed = 0;
  for (const id of sessions.keys()) {
    sessions.delete(id);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

function createPaginationSession(options) {
  sweepExpiredSessions();
  pruneToMaxSessions();

  const userId = String(options?.userId || '').trim();
  const pages = Array.isArray(options?.pages) ? options.pages.map((p) => String(p || '')) : [];

  if (!userId) {
    throw new Error('Pagination session requires userId.');
  }
  if (pages.length === 0) {
    throw new Error('Pagination session requires at least one page.');
  }

  const now = Date.now();
  const ttlMs = Number(options?.ttlMs || DEFAULT_TTL_MS);
  const expiresAt = now + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS);

  const session = {
    id: createSessionId(),
    kind: String(options?.kind || 'pagination'),
    userId,
    pages,
    title: String(options?.title || '').trim(),
    color: options?.color ?? null,
    footer: String(options?.footer || '').trim(),
    extraComponents: Array.isArray(options?.extraComponents) ? options.extraComponents : [],
    pageIndex: 0,
    createdAt: now,
    expiresAt,
  };

  sessions.set(session.id, session);
  return session;
}

function getPaginationSession(id) {
  const sessionId = String(id || '').trim();
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function deletePaginationSession(id) {
  const sessionId = String(id || '').trim();
  if (!sessionId) {
    return false;
  }
  return sessions.delete(sessionId);
}

module.exports = {
  createPaginationSession,
  deletePaginationSession,
  getPaginationSession,
  __private: {
    sessions,
    sweepExpiredSessions,
    pruneToMaxSessions,
  },
};
