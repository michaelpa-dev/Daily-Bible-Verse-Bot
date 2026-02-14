const { getBookById, normalizeBookId } = require('../constants/books.js');
const { pickRandomVerseFromScope } = require('../constants/webVerseCounts.js');
const { fetchVerse } = require('../services/bibleApiWeb.js');

function buildErrorResponse(status, message, details = {}) {
  return {
    status,
    body: {
      error: message,
      ...details,
    },
  };
}

function normalizeRandomScopeFromPathSegment(segment) {
  const raw = String(segment || '').trim();
  if (!raw) {
    return null;
  }

  const upper = raw.toUpperCase();
  if (upper === 'OT' || upper === 'NT') {
    return upper;
  }

  // Accept canonical IDs + common aliases.
  const bookId = normalizeBookId(raw) || normalizeBookId(upper);
  return bookId || null;
}

async function handleRandomWebVerse(scope, options = {}) {
  const normalizedScope = normalizeRandomScopeFromPathSegment(scope);
  if (!normalizedScope) {
    return buildErrorResponse(
      400,
      'Invalid scope. Use OT, NT, or a WEB book id (ex: JHN).',
      { scope }
    );
  }

  // Deterministic override for tests: pass offset.
  const selection = pickRandomVerseFromScope(normalizedScope, {
    offset: options.offset,
  });

  const book = getBookById(selection.bookId);
  if (!book) {
    return buildErrorResponse(500, `Book metadata missing for ${selection.bookId}`);
  }

  const passage = await fetchVerse(selection.bookId, selection.chapter, selection.verse, {
    translation: 'web',
    fetchImpl: options.fetchImpl,
  });

  return {
    status: 200,
    body: {
      translation: {
        id: passage.translationId,
        name: passage.translationName,
        note: passage.translationNote,
      },
      reference: passage.reference,
      bookId: selection.bookId,
      bookName: book.name,
      chapter: selection.chapter,
      verse: selection.verse,
      text: passage.text,
      url: passage.url,
      source: passage.source,
    },
  };
}

module.exports = {
  handleRandomWebVerse,
  normalizeRandomScopeFromPathSegment,
};

