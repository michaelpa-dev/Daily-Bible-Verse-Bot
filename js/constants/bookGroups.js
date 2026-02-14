const { BOOKS } = require('./books.js');

const GROUPS = [
  {
    id: 'ot_pentateuch',
    label: 'OT: Pentateuch',
    bookIds: ['GEN', 'EXO', 'LEV', 'NUM', 'DEU'],
  },
  {
    id: 'ot_history',
    label: 'OT: History',
    bookIds: ['JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST'],
  },
  {
    id: 'ot_poetry',
    label: 'OT: Poetry & Wisdom',
    bookIds: ['JOB', 'PSA', 'PRO', 'ECC', 'SNG'],
  },
  {
    id: 'ot_major_prophets',
    label: 'OT: Major Prophets',
    bookIds: ['ISA', 'JER', 'LAM', 'EZK', 'DAN'],
  },
  {
    id: 'ot_minor_prophets',
    label: 'OT: Minor Prophets',
    bookIds: ['HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL'],
  },
  {
    id: 'nt_gospels',
    label: 'NT: Gospels',
    bookIds: ['MAT', 'MRK', 'LUK', 'JHN'],
  },
  {
    id: 'nt_history',
    label: 'NT: History',
    bookIds: ['ACT'],
  },
  {
    id: 'nt_paul',
    label: 'NT: Paul\'s Letters',
    bookIds: ['ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM'],
  },
  {
    id: 'nt_general',
    label: 'NT: General Letters',
    bookIds: ['HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD'],
  },
  {
    id: 'nt_apocalypse',
    label: 'NT: Apocalypse',
    bookIds: ['REV'],
  },
];

const groupsById = new Map(GROUPS.map((group) => [group.id, group]));
const groupByBookId = new Map();

for (const group of GROUPS) {
  for (const bookId of group.bookIds) {
    if (!groupByBookId.has(bookId)) {
      groupByBookId.set(bookId, group.id);
    }
  }
}

function getGroupById(groupId) {
  const normalized = String(groupId || '').trim();
  if (!normalized) {
    return null;
  }
  return groupsById.get(normalized) || null;
}

function getGroupIdForBook(bookId) {
  const normalized = String(bookId || '').trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return groupByBookId.get(normalized) || null;
}

function listGroups() {
  return GROUPS.slice();
}

function listBooksInCanonOrder(bookIds) {
  const wanted = new Set((bookIds || []).map((id) => String(id).toUpperCase()));
  return BOOKS.filter((book) => wanted.has(book.id)).map((book) => book.id);
}

module.exports = {
  GROUPS,
  getGroupById,
  getGroupIdForBook,
  listBooksInCanonOrder,
  listGroups,
};

