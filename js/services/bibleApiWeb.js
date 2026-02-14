const { translationApiUrl } = require('../config.js');
const { getBookById } = require('../constants/books.js');
const { logger } = require('../logger.js');
const devBotLogs = require('./devBotLogs.js');

const DEFAULT_TRANSLATION = 'web';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 250;

const passageCache = new Map();

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildBibleApiUrl(reference, translation = DEFAULT_TRANSLATION) {
  const base = trimTrailingSlash(String(translationApiUrl || 'https://bible-api.com/'));
  const encodedReference = encodeURIComponent(reference);
  return `${base}/${encodedReference}?translation=${encodeURIComponent(translation)}`;
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim();
}

function normalizeVerses(rawVerses) {
  if (!Array.isArray(rawVerses)) {
    return [];
  }

  return rawVerses
    .filter(Boolean)
    .map((verse) => ({
      bookId: verse.book_id || verse.bookId || null,
      bookName: verse.book_name || verse.bookName || null,
      chapter: Number(verse.chapter || 0),
      verse: Number(verse.verse || 0),
      text: sanitizeText(verse.text),
    }))
    .filter((verse) => verse.bookId && verse.bookName && verse.chapter > 0 && verse.verse > 0);
}

function pruneCache(maxEntries) {
  while (passageCache.size > maxEntries) {
    const firstKey = passageCache.keys().next().value;
    if (!firstKey) {
      break;
    }
    passageCache.delete(firstKey);
  }
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('global.fetch is not available; a fetchImpl override is required.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Daily-Bible-Verse-Bot (bible-api.com client)',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPassage(reference, options = {}) {
  const translation = (options.translation || DEFAULT_TRANSLATION).toLowerCase();
  const cacheTtlMs = Number(options.cacheTtlMs || DEFAULT_TTL_MS);
  const maxEntries = Number(options.maxCacheEntries || DEFAULT_MAX_CACHE_ENTRIES);

  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference) {
    throw new Error('Reference is required.');
  }

  const cacheKey = `${translation}:${normalizedReference}`;
  const now = Date.now();

  const cached = passageCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const url = buildBibleApiUrl(normalizedReference, translation);
  logger.debug(`Fetching bible-api.com passage: ${url}`);

  const startedAt = Date.now();
  let response;
  try {
    response = await fetchWithTimeout(url, options);
  } catch (error) {
    devBotLogs.logError('http.bibleApiWeb.fetch.error', error, {
      translation,
      reference: normalizedReference,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }

  devBotLogs.logEvent('info', 'http.bibleApiWeb.fetch', {
    translation,
    reference: normalizedReference,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  if (!response.ok) {
    let detail = '';
    try {
      detail = String(await response.text());
    } catch (error) {
      detail = '';
    }

    throw new Error(
      `bible-api.com request failed (${response.status}) for ${normalizedReference}${detail ? `: ${detail}` : ''}`
    );
  }

  const data = await response.json();
  const normalized = {
    reference: String(data.reference || normalizedReference).trim(),
    translationId: String(data.translation_id || translation).toLowerCase(),
    translationName: String(data.translation_name || 'World English Bible'),
    translationNote: String(data.translation_note || '').trim(),
    verses: normalizeVerses(data.verses),
    text: sanitizeText(data.text),
    raw: data,
    url,
    source: {
      name: 'bible-api.com',
      url: 'https://bible-api.com/',
    },
  };

  passageCache.set(cacheKey, { expiresAt: now + cacheTtlMs, data: normalized });
  pruneCache(maxEntries);

  return normalized;
}

async function fetchVerse(bookId, chapter, verse, options = {}) {
  const book = getBookById(bookId);
  if (!book) {
    throw new Error(`Unknown bookId: ${bookId}`);
  }

  const normalizedChapter = Number(chapter);
  const normalizedVerse = Number(verse);
  if (!Number.isFinite(normalizedChapter) || normalizedChapter <= 0) {
    throw new Error(`Invalid chapter: ${chapter}`);
  }
  if (!Number.isFinite(normalizedVerse) || normalizedVerse <= 0) {
    throw new Error(`Invalid verse: ${verse}`);
  }

  const reference = `${book.apiName} ${normalizedChapter}:${normalizedVerse}`;
  const passage = await fetchPassage(reference, options);

  const verseRecord = passage.verses.find(
    (candidate) =>
      candidate.bookId === book.id &&
      candidate.chapter === normalizedChapter &&
      candidate.verse === normalizedVerse
  );

  return {
    ...passage,
    bookId: book.id,
    bookName: book.name,
    chapter: normalizedChapter,
    verse: normalizedVerse,
    text: verseRecord ? verseRecord.text : passage.text,
  };
}

async function fetchPassageForBookChapter(bookId, chapter, verseSpec, options = {}) {
  const book = getBookById(bookId);
  if (!book) {
    throw new Error(`Unknown bookId: ${bookId}`);
  }

  const normalizedChapter = Number(chapter);
  if (!Number.isFinite(normalizedChapter) || normalizedChapter <= 0) {
    throw new Error(`Invalid chapter: ${chapter}`);
  }

  const reference = verseSpec
    ? `${book.apiName} ${normalizedChapter}:${String(verseSpec).trim()}`
    : `${book.apiName} ${normalizedChapter}`;

  const passage = await fetchPassage(reference, options);
  return {
    ...passage,
    bookId: book.id,
    bookName: book.name,
    chapter: normalizedChapter,
  };
}

function clearCache() {
  passageCache.clear();
}

module.exports = {
  DEFAULT_TRANSLATION,
  buildBibleApiUrl,
  clearCache,
  fetchPassage,
  fetchPassageForBookChapter,
  fetchVerse,
  __private: {
    normalizeVerses,
    pruneCache,
    sanitizeText,
  },
};

