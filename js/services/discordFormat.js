function formatDiscordTimestamp(iso, options = {}) {
  const style = String(options.style || 'F').trim() || 'F';
  const fallback = Object.prototype.hasOwnProperty.call(options, 'fallback')
    ? options.fallback
    : 'unknown';

  if (!iso) {
    return fallback;
  }

  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }

  return `<t:${Math.floor(timestamp / 1000)}:${style}>`;
}

module.exports = {
  formatDiscordTimestamp,
};

