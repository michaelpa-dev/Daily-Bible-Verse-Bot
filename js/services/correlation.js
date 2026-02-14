const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function generateCorrelationId() {
  try {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return crypto.randomBytes(16).toString('hex');
}

function runWithCorrelationId(correlationId, fn) {
  const id = String(correlationId || '').trim() || generateCorrelationId();
  return storage.run({ correlationId: id }, fn);
}

function getCorrelationId() {
  const store = storage.getStore();
  return store?.correlationId || null;
}

module.exports = {
  generateCorrelationId,
  getCorrelationId,
  runWithCorrelationId,
};

