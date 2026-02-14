const { getBookById, normalizeBookId } = require('../constants/books.js');

function normalizeReferenceInput(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\./g, '');
}

function parseVerseSpec(rawSpec) {
  const cleaned = String(rawSpec || '').trim().replace(/\s+/g, '');
  if (!cleaned) {
    return null;
  }

  const parts = cleaned.split(',').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const ranges = [];
  const verses = [];
  const seen = new Set();

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const value = Number(part);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid verse number: ${part}`);
      }

      ranges.push({ start: value, end: value });
      if (!seen.has(value)) {
        seen.add(value);
        verses.push(value);
      }
      continue;
    }

    const match = part.match(/^(\d+)-(\d+)$/);
    if (!match) {
      throw new Error(
        `Invalid verse range: "${part}". Use formats like 16, 16-18, or 31-33,46.`
      );
    }

    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) {
      throw new Error(`Invalid verse range: ${part}`);
    }
    if (end < start) {
      throw new Error(`Verse range must be ascending: ${part}`);
    }

    ranges.push({ start, end });
    for (let verse = start; verse <= end; verse += 1) {
      if (!seen.has(verse)) {
        seen.add(verse);
        verses.push(verse);
      }
    }
  }

  // Keep a canonical spec for display (no spaces).
  const verseSpec = ranges
    .map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`))
    .join(',');

  return {
    verseSpec,
    verses,
    ranges,
  };
}

function parseScriptureReference(input) {
  const normalized = normalizeReferenceInput(input);
  if (!normalized) {
    throw new Error('Reference is required.');
  }

  // Capture the trailing chapter and optional verse spec.
  const match = normalized.match(/(\d+)(?::([\d,\-\s]+))?\s*$/);
  if (!match || typeof match.index !== 'number') {
    throw new Error(
      `Unable to parse reference "${normalized}". Try formats like "John 3:16", "Ps 23", or "Matt 25:31-33,46".`
    );
  }

  const chapter = Number(match[1]);
  if (!Number.isFinite(chapter) || chapter <= 0) {
    throw new Error(`Invalid chapter number: ${match[1]}`);
  }

  const bookPart = normalized.slice(0, match.index).trim();
  if (!bookPart) {
    throw new Error(
      `Missing book name in reference "${normalized}". Example: "John 3:16".`
    );
  }

  const bookId = normalizeBookId(bookPart);
  if (!bookId) {
    throw new Error(
      `Unknown book "${bookPart}". Try "John", "JHN", "1 Cor", "Song of Solomon", etc.`
    );
  }

  const book = getBookById(bookId);
  if (!book) {
    throw new Error(`Book not found for id ${bookId}.`);
  }

  const verseSpecRaw = match[2];
  const verseParsed = verseSpecRaw ? parseVerseSpec(verseSpecRaw) : null;

  const reference = verseParsed
    ? `${book.name} ${chapter}:${verseParsed.verseSpec}`
    : `${book.name} ${chapter}`;

  return {
    bookId,
    bookName: book.name,
    apiName: book.apiName,
    chapter,
    verseSpec: verseParsed?.verseSpec || null,
    verses: verseParsed?.verses || null,
    chapterWhole: !verseParsed,
    reference,
  };
}

module.exports = {
  normalizeReferenceInput,
  parseScriptureReference,
  parseVerseSpec,
};

