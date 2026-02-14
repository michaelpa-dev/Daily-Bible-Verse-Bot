const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const { getBookById, getBookIdsByTestament } = require('./books.js');

const VERSE_COUNTS_PATH = path.join(__dirname, '..', 'data', 'webVerseCounts.json');

let cached = null;
let cachedTotals = null;

function loadVerseCounts() {
  if (cached) {
    return cached;
  }

  if (!fs.existsSync(VERSE_COUNTS_PATH)) {
    throw new Error(
      `Missing verse count index at ${VERSE_COUNTS_PATH}. Run: node scripts/generate-web-verse-counts.js`
    );
  }

  const raw = JSON.parse(fs.readFileSync(VERSE_COUNTS_PATH, 'utf8'));
  if (!raw || raw.translationId !== 'web' || typeof raw.books !== 'object') {
    throw new Error(`Invalid verse count index format: ${VERSE_COUNTS_PATH}`);
  }

  cached = raw;
  return cached;
}

function getBookChapterVerseCounts(bookId) {
  const data = loadVerseCounts();
  const normalized = String(bookId || '').toUpperCase();
  const record = data.books?.[normalized];
  if (!record || typeof record.chapters !== 'object') {
    return null;
  }
  return record.chapters;
}

function getBookChapterCount(bookId) {
  const chapters = getBookChapterVerseCounts(bookId);
  if (!chapters) {
    return 0;
  }
  return Object.keys(chapters).length;
}

function getChapterVerseCount(bookId, chapter) {
  const chapters = getBookChapterVerseCounts(bookId);
  if (!chapters) {
    return 0;
  }
  const key = String(Number(chapter));
  return Number(chapters[key] || 0);
}

function computeTotals() {
  const data = loadVerseCounts();
  const totals = { OT: 0, NT: 0, all: 0, byBook: {} };

  for (const [bookId, record] of Object.entries(data.books || {})) {
    let total = 0;
    for (const count of Object.values(record.chapters || {})) {
      total += Number(count || 0);
    }

    totals.byBook[bookId] = total;
    totals.all += total;
    if (record.testament === 'OT') totals.OT += total;
    if (record.testament === 'NT') totals.NT += total;
  }

  return totals;
}

function getTotals() {
  if (!cachedTotals) {
    cachedTotals = computeTotals();
  }
  return cachedTotals;
}

function pickRandomVerseFromBook(bookId, options = {}) {
  const totals = getTotals();
  const normalizedBookId = String(bookId || '').toUpperCase();
  const totalVerses = Number(totals.byBook[normalizedBookId] || 0);
  if (totalVerses <= 0) {
    throw new Error(`Unknown bookId or missing verse counts: ${normalizedBookId}`);
  }

  const offset = options.offset != null
    ? Number(options.offset)
    : crypto.randomInt(0, totalVerses);

  if (!Number.isFinite(offset) || offset < 0 || offset >= totalVerses) {
    throw new Error(`Invalid verse offset ${options.offset} for book ${normalizedBookId}`);
  }

  const chapters = getBookChapterVerseCounts(normalizedBookId);
  let remaining = offset;

  const chapterNumbers = Object.keys(chapters)
    .map((value) => Number(value))
    .sort((a, b) => a - b);

  for (const chapter of chapterNumbers) {
    const count = Number(chapters[String(chapter)] || 0);
    if (remaining < count) {
      return {
        bookId: normalizedBookId,
        chapter,
        verse: remaining + 1,
      };
    }
    remaining -= count;
  }

  throw new Error(`Verse offset mapping failed for ${normalizedBookId}`);
}

function pickRandomVerseFromTestament(testament, options = {}) {
  const normalizedTestament = String(testament || '').trim().toUpperCase();
  if (normalizedTestament !== 'OT' && normalizedTestament !== 'NT') {
    throw new Error(`Invalid testament: ${testament}`);
  }

  const totals = getTotals();
  const totalVerses = totals[normalizedTestament];
  if (totalVerses <= 0) {
    throw new Error(`Missing verse totals for ${normalizedTestament}`);
  }

  const offset = options.offset != null
    ? Number(options.offset)
    : crypto.randomInt(0, totalVerses);

  if (!Number.isFinite(offset) || offset < 0 || offset >= totalVerses) {
    throw new Error(`Invalid verse offset ${options.offset} for ${normalizedTestament}`);
  }

  let remaining = offset;
  const bookIds = getBookIdsByTestament(normalizedTestament);

  for (const bookId of bookIds) {
    const bookTotal = Number(totals.byBook[bookId] || 0);
    if (remaining < bookTotal) {
      return pickRandomVerseFromBook(bookId, { offset: remaining });
    }
    remaining -= bookTotal;
  }

  throw new Error(`Verse offset mapping failed for testament ${normalizedTestament}`);
}

function pickRandomVerseFromScope(scope, options = {}) {
  const raw = String(scope || '').trim();
  const upper = raw.toUpperCase();

  if (upper === 'OT' || upper === 'NT') {
    return pickRandomVerseFromTestament(upper, options);
  }

  const book = getBookById(upper);
  if (!book) {
    throw new Error(`Unknown scope: ${scope}`);
  }
  return pickRandomVerseFromBook(book.id, options);
}

module.exports = {
  VERSE_COUNTS_PATH,
  getBookChapterCount,
  getChapterVerseCount,
  getTotals,
  loadVerseCounts,
  pickRandomVerseFromBook,
  pickRandomVerseFromScope,
  pickRandomVerseFromTestament,
};

