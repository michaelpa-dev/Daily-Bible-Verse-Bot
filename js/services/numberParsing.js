function parsePositiveInt(value, defaultValue) {
  if (value == null || String(value).trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return Math.floor(parsed);
}

module.exports = {
  parsePositiveInt,
};
