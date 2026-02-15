function isRetryableStatus(status) {
  if (!Number.isFinite(status)) {
    return false;
  }

  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfterMs(value) {
  if (value == null || String(value).trim().length === 0) {
    return 0;
  }

  const seconds = Number(String(value).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  // Be polite; clamp to something reasonable so a single response cannot stall a command forever.
  return Math.min(60_000, Math.floor(seconds * 1000));
}

module.exports = {
  isRetryableStatus,
  parseRetryAfterMs,
};

