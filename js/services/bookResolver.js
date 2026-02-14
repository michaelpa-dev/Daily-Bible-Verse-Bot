const { BOOKS, getBookById } = require('../constants/books.js');

const ORDINAL_TOKEN_MAP = new Map([
  ['first', '1'],
  ['1st', '1'],
  ['one', '1'],
  ['second', '2'],
  ['2nd', '2'],
  ['two', '2'],
  ['third', '3'],
  ['3rd', '3'],
  ['three', '3'],
  // Roman numerals people commonly type for 1/2/3 books.
  ['i', '1'],
  ['ii', '2'],
  ['iii', '3'],
]);

const DEFAULT_MAX_CANDIDATES = 5;

// These thresholds are intentionally conservative: we only auto-resolve when the
// input is clear, and otherwise we return candidate suggestions for confirmation.
const AUTO_RESOLVE_MIN_SCORE = 0.92;
const AMBIGUOUS_SCORE_DELTA = 0.06;

let cachedAliasIndex = null;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeOrdinalToken(token) {
  const raw = String(token || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  return ORDINAL_TOKEN_MAP.get(raw) || raw;
}

function normalizeBookQuery(input) {
  let value = String(input || '').trim().toLowerCase();
  if (!value) {
    return '';
  }

  // Convert punctuation into spaces so inputs like "1-sam", "1sam.", "song-of-songs" work.
  value = value
    .replace(/[–—]/g, '-') // normalize unicode dashes
    .replace(/(\d)([a-z])/g, '$1 $2') // "1sam" -> "1 sam"
    .replace(/([a-z])(\d)/g, '$1 $2') // "ps23" -> "ps 23"
    .replace(/[^a-z0-9]+/g, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) {
    return '';
  }

  const tokens = value
    .split(' ')
    .filter(Boolean)
    .map(normalizeOrdinalToken)
    .filter(Boolean);

  return tokens.join(' ');
}

function tokenize(normalized) {
  return String(normalized || '')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseLeadingOrdinal(tokens) {
  const first = tokens?.[0];
  if (first === '1' || first === '2' || first === '3') {
    return Number(first);
  }
  return null;
}

function getBookOrdinal(book) {
  const match = String(book?.name || '').trim().match(/^([123])\s+/);
  if (!match) {
    return null;
  }
  const ordinal = Number(match[1]);
  return Number.isFinite(ordinal) ? ordinal : null;
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');

  if (left === right) {
    return 0;
  }
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }

  const aLen = left.length;
  const bLen = right.length;

  // Use a single row DP for memory efficiency.
  const dp = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j += 1) {
    dp[j] = j;
  }

  for (let i = 1; i <= aLen; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    const aChar = left.charCodeAt(i - 1);

    for (let j = 1; j <= bLen; j += 1) {
      const temp = dp[j];
      const bChar = right.charCodeAt(j - 1);
      const cost = aChar === bChar ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1, // deletion
        dp[j - 1] + 1, // insertion
        prev + cost // substitution
      );
      prev = temp;
    }
  }

  return dp[bLen];
}

function stringSimilarity(a, b) {
  const left = String(a || '');
  const right = String(b || '');

  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const maxLen = Math.max(left.length, right.length);
  const distance = levenshteinDistance(left, right);
  return clamp01(1 - distance / maxLen);
}

function tokenJaccardSimilarity(leftTokens, rightTokens) {
  const a = new Set(leftTokens || []);
  const b = new Set(rightTokens || []);
  if (a.size === 0 && b.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function scoreNormalizedQuery(query, candidate) {
  const q = String(query || '');
  const c = String(candidate || '');
  if (!q || !c) {
    return 0;
  }
  if (q === c) {
    return 1;
  }

  const stringScore = stringSimilarity(q, c);
  const tokenScore = tokenJaccardSimilarity(tokenize(q), tokenize(c));

  let score = 0.65 * stringScore + 0.35 * tokenScore;

  // Small bonuses for strong prefix matches, but only when the query isn't tiny.
  if (q.length >= 4 && c.startsWith(q)) {
    score += 0.08;
  } else if (c.length >= 4 && q.startsWith(c)) {
    score += 0.04;
  }

  return clamp01(score);
}

function buildAliasIndex() {
  const index = new Map();

  function addAlias(rawAlias, bookId) {
    const normalized = normalizeBookQuery(rawAlias);
    if (!normalized) {
      return;
    }

    const bucket = index.get(normalized) || new Set();
    bucket.add(bookId);
    index.set(normalized, bucket);

    const compact = normalized.replace(/\s+/g, '');
    if (compact && compact !== normalized) {
      const compactBucket = index.get(compact) || new Set();
      compactBucket.add(bookId);
      index.set(compact, compactBucket);
    }
  }

  for (const book of BOOKS) {
    addAlias(book.id, book.id);
    addAlias(book.name, book.id);
    addAlias(book.apiName, book.id);
    for (const alias of book.aliases || []) {
      addAlias(alias, book.id);
    }
  }

  // Add a few extremely common shorthand inputs that are ambiguous unless an ordinal is present.
  // We intentionally return multiple candidates so the caller can prompt for confirmation.
  addAlias('sam', '1SA');
  addAlias('sam', '2SA');
  addAlias('samuel', '1SA');
  addAlias('samuel', '2SA');

  return index;
}

function getAliasIndex() {
  if (!cachedAliasIndex) {
    cachedAliasIndex = buildAliasIndex();
  }
  return cachedAliasIndex;
}

function sortCandidates(candidates) {
  return (candidates || [])
    .slice()
    .sort((a, b) => b.score - a.score || String(a.bookId).localeCompare(String(b.bookId)));
}

function resolveBook(input, options = {}) {
  const maxCandidates = Number(options.maxCandidates || DEFAULT_MAX_CANDIDATES);
  const normalizedInput = normalizeBookQuery(input);
  const tokens = tokenize(normalizedInput);
  const inputOrdinal = parseLeadingOrdinal(tokens);

  if (!normalizedInput) {
    return {
      kind: 'not_found',
      input: String(input || ''),
      normalizedInput,
      candidates: [],
      reason: 'empty',
    };
  }

  const aliasIndex = getAliasIndex();
  const exact = aliasIndex.get(normalizedInput);
  if (exact && exact.size > 0) {
    const ids = Array.from(exact);
    if (ids.length === 1) {
      const book = getBookById(ids[0]);
      return {
        kind: 'resolved',
        input: String(input || ''),
        normalizedInput,
        bookId: ids[0],
        book,
        score: 1,
        method: 'alias',
        candidates: [{ bookId: ids[0], book, score: 1, method: 'alias' }],
      };
    }

    // Ambiguous alias: return candidates so callers can confirm quickly.
    const candidates = ids
      .map((bookId) => ({ bookId, book: getBookById(bookId), score: 0.86, method: 'alias' }))
      .filter((candidate) => candidate.book);

    return {
      kind: 'needs_confirmation',
      input: String(input || ''),
      normalizedInput,
      score: candidates.length > 0 ? candidates[0].score : 0,
      method: 'alias',
      candidates: sortCandidates(candidates).slice(0, maxCandidates),
      reason: 'ambiguous_alias',
    };
  }

  const scored = [];
  for (const book of BOOKS) {
    const bookOrdinal = getBookOrdinal(book);
    const rawCandidates = [book.id, book.name, book.apiName, ...(book.aliases || [])];

    let best = 0;
    for (const raw of rawCandidates) {
      const normalizedCandidate = normalizeBookQuery(raw);
      if (!normalizedCandidate) {
        continue;
      }
      best = Math.max(best, scoreNormalizedQuery(normalizedInput, normalizedCandidate));
      if (best >= 1) {
        break;
      }
    }

    let score = best;
    if (inputOrdinal && bookOrdinal && inputOrdinal !== bookOrdinal) {
      score *= 0.35;
    } else if (inputOrdinal && !bookOrdinal) {
      score *= 0.15;
    }

    scored.push({ bookId: book.id, book, score: clamp01(score), method: 'fuzzy' });
  }

  const sorted = sortCandidates(scored);
  const top = sorted[0] || null;
  const second = sorted[1] || null;

  const candidates = sorted.slice(0, maxCandidates);

  if (!top || top.score <= 0) {
    return {
      kind: 'not_found',
      input: String(input || ''),
      normalizedInput,
      candidates,
      reason: 'no_candidates',
    };
  }

  const ambiguous =
    Boolean(second) &&
    top.score >= 0.75 &&
    second.score >= 0.75 &&
    top.score - second.score <= AMBIGUOUS_SCORE_DELTA;

  if (top.score >= AUTO_RESOLVE_MIN_SCORE && !ambiguous) {
    return {
      kind: 'resolved',
      input: String(input || ''),
      normalizedInput,
      bookId: top.bookId,
      book: top.book,
      score: top.score,
      method: 'fuzzy',
      candidates,
    };
  }

  return {
    kind: 'needs_confirmation',
    input: String(input || ''),
    normalizedInput,
    score: top.score,
    method: 'fuzzy',
    candidates,
    reason: ambiguous ? 'ambiguous_fuzzy' : 'low_confidence',
  };
}

module.exports = {
  resolveBook,
  normalizeBookQuery,
  __private: {
    AMBIGUOUS_SCORE_DELTA,
    AUTO_RESOLVE_MIN_SCORE,
    buildAliasIndex,
    getBookOrdinal,
    levenshteinDistance,
    scoreNormalizedQuery,
    stringSimilarity,
    tokenize,
  },
};

