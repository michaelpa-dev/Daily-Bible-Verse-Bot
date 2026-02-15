const { getBookById } = require('../constants/books.js');
const { getBookChapterCount } = require('../constants/webVerseCounts.js');
const devBotLogs = require('./devBotLogs.js');
const { resolveBook } = require('./bookResolver.js');

function normalizeReferenceInput(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\./g, '');
}

function parseVerseSpec(rawSpec) {
  const cleaned = String(rawSpec || '')
    .trim()
    .replace(/\s+/g, '');
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
      throw new Error(`Invalid verse range: "${part}". Use formats like 16, 16-18, or 31-33,46.`);
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
    .map((range) =>
      range.start === range.end ? String(range.start) : `${range.start}-${range.end}`
    )
    .join(',');

  return {
    verseSpec,
    verses,
    ranges,
  };
}

function parseScriptureReferenceParts(input) {
  const normalized = normalizeReferenceInput(input);
  if (!normalized) {
    return {
      kind: 'error',
      normalizedInput: normalized,
      message: 'Reference is required.',
    };
  }

  // Capture the trailing chapter and optional verse spec.
  const match = normalized.match(/(\d+)(?::([\d,\-\s]+))?\s*$/);
  if (!match || typeof match.index !== 'number') {
    // If the user only provided a book name ("1 samuel", "john"), assume chapter 1.
    // If there is a colon, the input is likely malformed (ex: "john 3:"), so we
    // still return a helpful parse error instead of guessing.
    if (normalized.includes(':')) {
      return {
        kind: 'error',
        normalizedInput: normalized,
        message: `Unable to parse reference "${normalized}". Try formats like "John 3:16", "Ps 23", or "Matt 25:31-33,46".`,
      };
    }

    return {
      kind: 'parts',
      normalizedInput: normalized,
      bookPart: normalized,
      chapter: 1,
      verseSpecRaw: null,
      assumedChapter: true,
    };
  }

  const chapter = Number(match[1]);
  if (!Number.isFinite(chapter) || chapter <= 0) {
    return {
      kind: 'error',
      normalizedInput: normalized,
      message: `Invalid chapter number: ${match[1]}`,
    };
  }

  const bookPart = normalized.slice(0, match.index).trim();
  if (!bookPart) {
    return {
      kind: 'error',
      normalizedInput: normalized,
      message: `Missing book name in reference "${normalized}". Example: "John 3:16".`,
    };
  }

  return {
    kind: 'parts',
    normalizedInput: normalized,
    bookPart,
    chapter,
    verseSpecRaw: match[2] || null,
  };
}

function buildBookSuggestions(candidates) {
  const unique = [];
  const seen = new Set();

  for (const candidate of candidates || []) {
    const bookId = String(candidate?.bookId || '').toUpperCase();
    if (!bookId || seen.has(bookId)) {
      continue;
    }
    seen.add(bookId);
    const book = candidate.book || getBookById(bookId);
    if (!book) {
      // Defensive: the resolver should only emit canonical bookIds; if this ever
      // happens it indicates a bug in book resolution or candidate shaping.
      devBotLogs.logEvent('debug', 'reference.book.suggestion.missing', { bookId });
      continue;
    }
    unique.push(`${book.name} (${book.id})`);
  }

  return unique;
}

function parseScriptureReferenceDetailed(input, options = {}) {
  // This is the "new" reference parser path that includes:
  // - fuzzy/alias book resolution (human-friendly input)
  // - structured output ("ok" vs "needs_confirmation" vs "error")
  // - chapter existence validation using WEB metadata
  const parts = parseScriptureReferenceParts(input);
  if (parts.kind !== 'parts') {
    return parts;
  }

  const resolvedBook = resolveBook(parts.bookPart, {
    maxCandidates: options.maxCandidates,
  });

  devBotLogs.logEvent('info', 'reference.book.resolve', {
    input: String(parts.bookPart || ''),
    normalized: resolvedBook.normalizedInput,
    kind: resolvedBook.kind,
    method: resolvedBook.method,
    score: resolvedBook.score,
    topCandidates: (resolvedBook.candidates || []).slice(0, 3).map((candidate) => ({
      bookId: candidate.bookId,
      score: candidate.score,
    })),
  });

  if (resolvedBook.kind !== 'resolved') {
    const suggestions = buildBookSuggestions(resolvedBook.candidates);
    return {
      kind: 'needs_confirmation',
      normalizedInput: parts.normalizedInput,
      bookPart: parts.bookPart,
      chapter: parts.chapter,
      verseSpecRaw: parts.verseSpecRaw,
      resolver: resolvedBook,
      suggestions,
    };
  }

  const bookId = resolvedBook.bookId;
  const book = getBookById(bookId);
  if (!book) {
    return {
      kind: 'error',
      normalizedInput: parts.normalizedInput,
      message: `Book not found for id ${bookId}.`,
    };
  }

  const maxChapters = getBookChapterCount(bookId);
  if (maxChapters > 0 && parts.chapter > maxChapters) {
    return {
      kind: 'error',
      normalizedInput: parts.normalizedInput,
      message: `${book.name} only has ${maxChapters} chapter${maxChapters === 1 ? '' : 's'}.`,
    };
  }

  let verseParsed = null;
  try {
    verseParsed = parts.verseSpecRaw ? parseVerseSpec(parts.verseSpecRaw) : null;
  } catch (error) {
    return {
      kind: 'error',
      normalizedInput: parts.normalizedInput,
      message: error instanceof Error ? error.message : 'Invalid verse specification.',
    };
  }

  const reference = verseParsed
    ? `${book.name} ${parts.chapter}:${verseParsed.verseSpec}`
    : `${book.name} ${parts.chapter}`;

  return {
    kind: 'ok',
    normalizedInput: parts.normalizedInput,
    parsed: {
      bookId,
      bookName: book.name,
      apiName: book.apiName,
      chapter: parts.chapter,
      verseSpec: verseParsed?.verseSpec || null,
      verses: verseParsed?.verses || null,
      chapterWhole: !verseParsed,
      reference,
    },
    resolver: resolvedBook,
  };
}

function parseScriptureReference(input) {
  const detailed = parseScriptureReferenceDetailed(input);
  if (detailed.kind === 'ok') {
    return detailed.parsed;
  }

  if (detailed.kind === 'needs_confirmation') {
    const suggestions = detailed.suggestions || [];
    const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
    throw new Error(`I couldn't confidently resolve "${detailed.bookPart}".${suffix}`);
  }

  throw new Error(detailed.message || 'Invalid reference.');
}

module.exports = {
  normalizeReferenceInput,
  parseScriptureReferenceDetailed,
  parseScriptureReference,
  parseScriptureReferenceParts,
  parseVerseSpec,
};
