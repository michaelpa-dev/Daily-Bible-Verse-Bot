const { BOOKS, getBookById } = require('../constants/books.js');
const { getBookChapterCount } = require('../constants/webVerseCounts.js');

const PLAN_TYPES = ['one-year', 'gospels-30', 'psalms-proverbs', 'new-testament-90', 'custom'];

function listBookIdsByTestament(testament) {
  const normalized = String(testament || '').toUpperCase();
  if (normalized !== 'OT' && normalized !== 'NT') {
    return [];
  }
  return BOOKS.filter((book) => book.testament === normalized).map((book) => book.id);
}

function listChapterRefs(bookIds) {
  const refs = [];
  for (const bookId of bookIds) {
    const chapterCount = getBookChapterCount(bookId);
    if (!chapterCount) {
      continue;
    }
    for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
      refs.push({ bookId, chapter, verseSpec: null });
    }
  }
  return refs;
}

function distributeChunks(totalItems, totalDays) {
  const days = Math.max(1, Math.floor(totalDays));
  const base = Math.floor(totalItems / days);
  const remainder = totalItems % days;

  const chunks = [];
  for (let day = 0; day < days; day += 1) {
    chunks.push(base + (day < remainder ? 1 : 0));
  }
  return chunks;
}

function normalizePace(plan) {
  const paceType = String(plan?.paceType || plan?.pace_type || '').trim();
  const paceValue = Number(plan?.paceValue ?? plan?.pace_value);

  if (!Number.isFinite(paceValue) || paceValue <= 0) {
    return { paceType: 'chapters', chaptersPerDay: 3 };
  }

  if (paceType === 'minutes') {
    // Rough: ~4 minutes per chapter.
    return { paceType, chaptersPerDay: Math.max(1, Math.ceil(paceValue / 4)) };
  }

  if (paceType === 'verses') {
    // Rough: ~25 verses per chapter.
    return { paceType, chaptersPerDay: Math.max(1, Math.ceil(paceValue / 25)) };
  }

  return { paceType: 'chapters', chaptersPerDay: Math.max(1, Math.floor(paceValue)) };
}

function buildReferenceLabel(ref) {
  const book = getBookById(ref.bookId);
  const bookName = book ? book.name : ref.bookId;
  return `${bookName} ${ref.chapter}${ref.verseSpec ? `:${ref.verseSpec}` : ''}`;
}

function buildTemplatePlan(planType) {
  const normalizedType = String(planType || '').trim();
  if (!PLAN_TYPES.includes(normalizedType)) {
    throw new Error(`Unknown planType: ${planType}`);
  }

  if (normalizedType === 'gospels-30') {
    return {
      scope: 'SpecificBooks',
      books: ['MAT', 'MRK', 'LUK', 'JHN'],
      totalDays: 30,
    };
  }

  if (normalizedType === 'new-testament-90') {
    return {
      scope: 'NT',
      books: listBookIdsByTestament('NT'),
      totalDays: 90,
    };
  }

  if (normalizedType === 'one-year') {
    return {
      scope: 'Both',
      books: BOOKS.map((book) => book.id),
      totalDays: 365,
    };
  }

  if (normalizedType === 'psalms-proverbs') {
    return {
      scope: 'SpecificBooks',
      books: ['PSA', 'PRO'],
      totalDays: null,
    };
  }

  return {
    scope: 'Custom',
    books: [],
    totalDays: null,
  };
}

function getReadingForDay(plan, dayIndex) {
  const planType = String(plan?.planType || plan?.plan_type || '').trim();
  if (!PLAN_TYPES.includes(planType)) {
    throw new Error(`Unknown planType: ${planType}`);
  }

  const index = Number(dayIndex);
  if (!Number.isFinite(index) || index < 0) {
    throw new Error('Invalid dayIndex.');
  }

  if (planType === 'psalms-proverbs') {
    const psalmChapter = (index % 150) + 1;
    const proverbChapter = (index % 31) + 1;
    return [
      { bookId: 'PSA', chapter: psalmChapter, verseSpec: null },
      { bookId: 'PRO', chapter: proverbChapter, verseSpec: null },
    ];
  }

  if (planType === 'gospels-30' || planType === 'new-testament-90' || planType === 'one-year') {
    const template = buildTemplatePlan(planType);
    const allRefs = listChapterRefs(template.books);
    const chunks = distributeChunks(allRefs.length, template.totalDays);

    if (index >= chunks.length) {
      return [];
    }

    let offset = 0;
    for (let i = 0; i < index; i += 1) {
      offset += chunks[i];
    }

    const size = chunks[index];
    return allRefs.slice(offset, offset + size);
  }

  // Custom plan: sequential chapters across chosen scope/books.
  const normalizedScope = String(plan?.scope || '').trim();
  const planBooks = Array.isArray(plan?.books) ? plan.books : [];

  let bookIds = [];
  if (normalizedScope === 'OT') {
    bookIds = listBookIdsByTestament('OT');
  } else if (normalizedScope === 'NT') {
    bookIds = listBookIdsByTestament('NT');
  } else if (normalizedScope === 'Both') {
    bookIds = BOOKS.map((book) => book.id);
  } else if (normalizedScope === 'SpecificBooks') {
    bookIds = planBooks.map((value) => String(value).toUpperCase()).filter(Boolean);
  } else {
    bookIds = BOOKS.map((book) => book.id);
  }

  const { chaptersPerDay } = normalizePace(plan);
  const allRefs = listChapterRefs(bookIds);
  const start = index * chaptersPerDay;
  return allRefs.slice(start, start + chaptersPerDay);
}

module.exports = {
  PLAN_TYPES,
  buildReferenceLabel,
  buildTemplatePlan,
  getReadingForDay,
  normalizePace,
};
