function paginateLines(lines, options = {}) {
  const maxChars = Number(options.maxChars || 3800);
  if (!Number.isFinite(maxChars) || maxChars < 1000) {
    throw new Error(`Invalid maxChars: ${options.maxChars}`);
  }

  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => String(line || '')).filter((line) => line.trim().length > 0)
    : [];

  if (normalizedLines.length === 0) {
    return ['(no content)'];
  }

  const pages = [];
  let current = '';

  for (const line of normalizedLines) {
    if (line.length > maxChars) {
      // Never split a single logical line (typically a verse) across pages. If a single
      // verse line is too long for Discord embed limits, truncate it.
      const truncated =
        maxChars > 10 ? `${line.slice(0, maxChars - 3)}...` : line.slice(0, maxChars);

      if (current.length > 0) {
        pages.push(current);
        current = '';
      }

      pages.push(truncated);
      continue;
    }

    const next = current.length === 0 ? line : `${current}\n${line}`;

    if (next.length > maxChars) {
      if (current.length === 0) {
        pages.push(line);
        current = '';
        continue;
      }

      pages.push(current);
      current = line;
      continue;
    }

    current = next;
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return pages;
}

module.exports = {
  paginateLines,
};
