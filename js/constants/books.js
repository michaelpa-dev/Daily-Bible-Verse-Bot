const BOOKS = [
  // Old Testament (OT)
  { id: 'GEN', name: 'Genesis', testament: 'OT', apiName: 'Genesis', aliases: ['gen', 'ge'] },
  { id: 'EXO', name: 'Exodus', testament: 'OT', apiName: 'Exodus', aliases: ['exo', 'ex'] },
  { id: 'LEV', name: 'Leviticus', testament: 'OT', apiName: 'Leviticus', aliases: ['lev', 'le'] },
  {
    id: 'NUM',
    name: 'Numbers',
    testament: 'OT',
    apiName: 'Numbers',
    aliases: ['num', 'nu', 'nm', 'nb'],
  },
  {
    id: 'DEU',
    name: 'Deuteronomy',
    testament: 'OT',
    apiName: 'Deuteronomy',
    aliases: ['deu', 'deut', 'dt'],
  },
  {
    id: 'JOS',
    name: 'Joshua',
    testament: 'OT',
    apiName: 'Joshua',
    aliases: ['jos', 'josh', 'jsh'],
  },
  {
    id: 'JDG',
    name: 'Judges',
    testament: 'OT',
    apiName: 'Judges',
    aliases: ['jdg', 'judg', 'jg', 'jd'],
  },
  { id: 'RUT', name: 'Ruth', testament: 'OT', apiName: 'Ruth', aliases: ['rut', 'rth', 'ru'] },
  {
    id: '1SA',
    name: '1 Samuel',
    testament: 'OT',
    apiName: '1 Samuel',
    aliases: ['1sa', '1 sam', '1sam', 'i sam', 'first samuel', '1 samuel'],
  },
  {
    id: '2SA',
    name: '2 Samuel',
    testament: 'OT',
    apiName: '2 Samuel',
    aliases: ['2sa', '2 sam', '2sam', 'ii sam', 'second samuel', '2 samuel'],
  },
  {
    id: '1KI',
    name: '1 Kings',
    testament: 'OT',
    apiName: '1 Kings',
    aliases: ['1ki', '1 kgs', '1kgs', '1 king', '1kings', 'i kings', 'first kings', '1 kings'],
  },
  {
    id: '2KI',
    name: '2 Kings',
    testament: 'OT',
    apiName: '2 Kings',
    aliases: ['2ki', '2 kgs', '2kgs', '2 king', '2kings', 'ii kings', 'second kings', '2 kings'],
  },
  {
    id: '1CH',
    name: '1 Chronicles',
    testament: 'OT',
    apiName: '1 Chronicles',
    aliases: ['1ch', '1 chr', '1chr', 'i chronicles', 'first chronicles', '1 chronicles'],
  },
  {
    id: '2CH',
    name: '2 Chronicles',
    testament: 'OT',
    apiName: '2 Chronicles',
    aliases: ['2ch', '2 chr', '2chr', 'ii chronicles', 'second chronicles', '2 chronicles'],
  },
  { id: 'EZR', name: 'Ezra', testament: 'OT', apiName: 'Ezra', aliases: ['ezr', 'ezra', 'ez'] },
  { id: 'NEH', name: 'Nehemiah', testament: 'OT', apiName: 'Nehemiah', aliases: ['neh', 'ne'] },
  { id: 'EST', name: 'Esther', testament: 'OT', apiName: 'Esther', aliases: ['est', 'es'] },
  { id: 'JOB', name: 'Job', testament: 'OT', apiName: 'Job', aliases: ['job', 'jb'] },
  {
    id: 'PSA',
    name: 'Psalms',
    testament: 'OT',
    apiName: 'Psalms',
    aliases: ['psa', 'ps', 'psalm', 'psalms', 'pslm', 'psm'],
  },
  {
    id: 'PRO',
    name: 'Proverbs',
    testament: 'OT',
    apiName: 'Proverbs',
    aliases: ['pro', 'prov', 'prv', 'pr'],
  },
  {
    id: 'ECC',
    name: 'Ecclesiastes',
    testament: 'OT',
    apiName: 'Ecclesiastes',
    aliases: ['ecc', 'eccl', 'qoheleth', 'ec'],
  },
  {
    id: 'SNG',
    name: 'Song of Solomon',
    testament: 'OT',
    apiName: 'Song of Solomon',
    aliases: [
      'sng',
      'song',
      'song of solomon',
      'songofsolomon',
      'song of songs',
      'songofsongs',
      'songs',
      'canticles',
    ],
  },
  { id: 'ISA', name: 'Isaiah', testament: 'OT', apiName: 'Isaiah', aliases: ['isa', 'is'] },
  {
    id: 'JER',
    name: 'Jeremiah',
    testament: 'OT',
    apiName: 'Jeremiah',
    aliases: ['jer', 'je', 'jr'],
  },
  {
    id: 'LAM',
    name: 'Lamentations',
    testament: 'OT',
    apiName: 'Lamentations',
    aliases: ['lam', 'la'],
  },
  {
    id: 'EZK',
    name: 'Ezekiel',
    testament: 'OT',
    apiName: 'Ezekiel',
    aliases: ['ezk', 'ezek', 'eze'],
  },
  { id: 'DAN', name: 'Daniel', testament: 'OT', apiName: 'Daniel', aliases: ['dan', 'da', 'dn'] },
  { id: 'HOS', name: 'Hosea', testament: 'OT', apiName: 'Hosea', aliases: ['hos', 'ho'] },
  { id: 'JOL', name: 'Joel', testament: 'OT', apiName: 'Joel', aliases: ['jol', 'joel', 'jl'] },
  { id: 'AMO', name: 'Amos', testament: 'OT', apiName: 'Amos', aliases: ['amo', 'am'] },
  { id: 'OBA', name: 'Obadiah', testament: 'OT', apiName: 'Obadiah', aliases: ['oba', 'ob'] },
  { id: 'JON', name: 'Jonah', testament: 'OT', apiName: 'Jonah', aliases: ['jon', 'jnh'] },
  { id: 'MIC', name: 'Micah', testament: 'OT', apiName: 'Micah', aliases: ['mic', 'mc'] },
  { id: 'NAM', name: 'Nahum', testament: 'OT', apiName: 'Nahum', aliases: ['nam', 'na'] },
  { id: 'HAB', name: 'Habakkuk', testament: 'OT', apiName: 'Habakkuk', aliases: ['hab', 'hb'] },
  {
    id: 'ZEP',
    name: 'Zephaniah',
    testament: 'OT',
    apiName: 'Zephaniah',
    aliases: ['zep', 'zeph', 'zp'],
  },
  { id: 'HAG', name: 'Haggai', testament: 'OT', apiName: 'Haggai', aliases: ['hag', 'hg'] },
  {
    id: 'ZEC',
    name: 'Zechariah',
    testament: 'OT',
    apiName: 'Zechariah',
    aliases: ['zec', 'zech', 'zc'],
  },
  { id: 'MAL', name: 'Malachi', testament: 'OT', apiName: 'Malachi', aliases: ['mal', 'ml'] },

  // New Testament (NT)
  {
    id: 'MAT',
    name: 'Matthew',
    testament: 'NT',
    apiName: 'Matthew',
    aliases: ['mat', 'matt', 'mt'],
  },
  {
    id: 'MRK',
    name: 'Mark',
    testament: 'NT',
    apiName: 'Mark',
    aliases: ['mrk', 'mark', 'mk', 'mr'],
  },
  { id: 'LUK', name: 'Luke', testament: 'NT', apiName: 'Luke', aliases: ['luk', 'luke', 'lk'] },
  { id: 'JHN', name: 'John', testament: 'NT', apiName: 'John', aliases: ['jhn', 'john', 'jn'] },
  { id: 'ACT', name: 'Acts', testament: 'NT', apiName: 'Acts', aliases: ['act', 'acts', 'ac'] },
  { id: 'ROM', name: 'Romans', testament: 'NT', apiName: 'Romans', aliases: ['rom', 'ro', 'rm'] },
  {
    id: '1CO',
    name: '1 Corinthians',
    testament: 'NT',
    apiName: '1 Corinthians',
    aliases: ['1co', '1 cor', '1cor', 'i cor', 'first corinthians', '1 corinthians'],
  },
  {
    id: '2CO',
    name: '2 Corinthians',
    testament: 'NT',
    apiName: '2 Corinthians',
    aliases: ['2co', '2 cor', '2cor', 'ii cor', 'second corinthians', '2 corinthians'],
  },
  { id: 'GAL', name: 'Galatians', testament: 'NT', apiName: 'Galatians', aliases: ['gal', 'ga'] },
  { id: 'EPH', name: 'Ephesians', testament: 'NT', apiName: 'Ephesians', aliases: ['eph', 'ep'] },
  {
    id: 'PHP',
    name: 'Philippians',
    testament: 'NT',
    apiName: 'Philippians',
    aliases: ['php', 'phil', 'phl'],
  },
  { id: 'COL', name: 'Colossians', testament: 'NT', apiName: 'Colossians', aliases: ['col', 'co'] },
  {
    id: '1TH',
    name: '1 Thessalonians',
    testament: 'NT',
    apiName: '1 Thessalonians',
    aliases: ['1th', '1 thes', '1thes', 'i thess', '1 thessalonians', 'first thessalonians'],
  },
  {
    id: '2TH',
    name: '2 Thessalonians',
    testament: 'NT',
    apiName: '2 Thessalonians',
    aliases: ['2th', '2 thes', '2thes', 'ii thess', '2 thessalonians', 'second thessalonians'],
  },
  {
    id: '1TI',
    name: '1 Timothy',
    testament: 'NT',
    apiName: '1 Timothy',
    aliases: ['1ti', '1 tim', '1tim', 'i tim', '1 timothy', 'first timothy'],
  },
  {
    id: '2TI',
    name: '2 Timothy',
    testament: 'NT',
    apiName: '2 Timothy',
    aliases: ['2ti', '2 tim', '2tim', 'ii tim', '2 timothy', 'second timothy'],
  },
  { id: 'TIT', name: 'Titus', testament: 'NT', apiName: 'Titus', aliases: ['tit', 'ti'] },
  {
    id: 'PHM',
    name: 'Philemon',
    testament: 'NT',
    apiName: 'Philemon',
    aliases: ['phm', 'philemon', 'philem', 'pm'],
  },
  { id: 'HEB', name: 'Hebrews', testament: 'NT', apiName: 'Hebrews', aliases: ['heb', 'he'] },
  {
    id: 'JAS',
    name: 'James',
    testament: 'NT',
    apiName: 'James',
    aliases: ['jas', 'james', 'jm', 'ja'],
  },
  {
    id: '1PE',
    name: '1 Peter',
    testament: 'NT',
    apiName: '1 Peter',
    aliases: ['1pe', '1 pet', '1pet', 'i pet', '1 peter', 'first peter'],
  },
  {
    id: '2PE',
    name: '2 Peter',
    testament: 'NT',
    apiName: '2 Peter',
    aliases: ['2pe', '2 pet', '2pet', 'ii pet', '2 peter', 'second peter'],
  },
  {
    id: '1JN',
    name: '1 John',
    testament: 'NT',
    apiName: '1 John',
    aliases: ['1jn', '1 jn', '1 john', 'first john', 'i john'],
  },
  {
    id: '2JN',
    name: '2 John',
    testament: 'NT',
    apiName: '2 John',
    aliases: ['2jn', '2 jn', '2 john', 'second john', 'ii john'],
  },
  {
    id: '3JN',
    name: '3 John',
    testament: 'NT',
    apiName: '3 John',
    aliases: ['3jn', '3 jn', '3 john', 'third john', 'iii john'],
  },
  { id: 'JUD', name: 'Jude', testament: 'NT', apiName: 'Jude', aliases: ['jud', 'jude'] },
  {
    id: 'REV',
    name: 'Revelation',
    testament: 'NT',
    apiName: 'Revelation',
    aliases: ['rev', 're', 'revelation'],
  },
];

const booksById = new Map();
const bookIdAliases = new Map();
const booksByTestament = new Map([
  ['OT', []],
  ['NT', []],
]);

function normalizeAlias(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
}

for (const book of BOOKS) {
  booksById.set(book.id, book);
  booksByTestament.get(book.testament)?.push(book.id);

  const aliasCandidates = [book.id, book.name, book.apiName, ...(book.aliases || [])];
  for (const alias of aliasCandidates) {
    const normalized = normalizeAlias(alias);
    if (!normalized) {
      continue;
    }
    // Keep first match; avoid accidental overwrites in ambiguous short aliases.
    if (!bookIdAliases.has(normalized)) {
      bookIdAliases.set(normalized, book.id);
    }
  }
}

function getBookById(bookId) {
  if (typeof bookId !== 'string') {
    return null;
  }
  return booksById.get(bookId.toUpperCase()) || null;
}

function normalizeBookId(input) {
  const normalized = normalizeAlias(input);
  if (!normalized) {
    return null;
  }
  const byAlias = bookIdAliases.get(normalized);
  if (byAlias) {
    return byAlias;
  }

  // Try compacting spaces for inputs like "songofsolomon".
  const compact = normalized.replace(/\s+/g, '');
  return bookIdAliases.get(compact) || null;
}

function getBookIdsByTestament(testament) {
  if (typeof testament !== 'string') {
    return [];
  }
  const normalized = testament.trim().toUpperCase();
  return Array.from(booksByTestament.get(normalized) || []);
}

module.exports = {
  BOOKS,
  getBookById,
  getBookIdsByTestament,
  normalizeBookId,
};
