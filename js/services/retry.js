const { parsePositiveInt } = require('./numberParsing.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffDelayMs(attempt, options) {
  const baseDelayMs = parsePositiveInt(options.baseDelayMs, 250);
  const maxDelayMs = parsePositiveInt(options.maxDelayMs, 5000);
  const factor = Number.isFinite(options.factor) && options.factor > 1 ? options.factor : 2;

  const exponent = Math.max(0, attempt - 1);
  const rawDelay = Math.min(maxDelayMs, Math.round(baseDelayMs * factor ** exponent));

  if (options.jitter === false) {
    return rawDelay;
  }

  // "Full jitter" style: randomize the delay to reduce thundering herds.
  return Math.floor(Math.random() * (rawDelay + 1));
}

async function retryAsync(fn, options = {}) {
  const maxAttempts = parsePositiveInt(options.maxAttempts, 3);
  const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => true;
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;
  const computeDelayMs =
    typeof options.computeDelayMs === 'function' ? options.computeDelayMs : null;

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn({ attempt, maxAttempts });
    } catch (error) {
      lastError = error;

      const canRetry = attempt < maxAttempts && Boolean(shouldRetry(error, attempt));
      if (!canRetry) {
        throw error;
      }

      let delayMs = computeDelayMs
        ? computeDelayMs({ attempt, maxAttempts, error })
        : computeBackoffDelayMs(attempt, options);
      if (!Number.isFinite(delayMs) || delayMs < 0) {
        delayMs = computeBackoffDelayMs(attempt, options);
      }
      if (onRetry) {
        try {
          onRetry({ attempt, maxAttempts, delayMs, error });
        } catch {
          // ignore observer failures
        }
      }

      await sleep(delayMs);
    }
  }

  // Should be unreachable, but keep a safe fallback.
  throw lastError || new Error('retryAsync failed without an error');
}

module.exports = {
  computeBackoffDelayMs,
  retryAsync,
  sleep,
};
