#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Generate per-chapter verse counts for bible-api.com (WEB translation).
 *
 * Why:
 * - We need reasonably-uniform random verse selection across OT/NT/books.
 * - bible-api.com provides text, but not an index of verse counts.
 * - We generate counts once during development and commit them to the repo.
 *
 * Output:
 * - js/data/webVerseCounts.json
 */

const fs = require('fs');
const path = require('path');

const { BOOKS } = require('../js/constants/books.js');

const OUTPUT_PATH = path.join(__dirname, '..', 'js', 'data', 'webVerseCounts.json');
const API_BASE = 'https://bible-api.com/';
const TRANSLATION = 'web';
const FORCE = process.argv.includes('--force');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Daily-Bible-Verse-Bot (verse count generator)',
    },
  });

  const bodyText = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    // fallthrough
  }

  return {
    ok: response.ok,
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    json: parsed,
    text: bodyText,
  };
}

function buildUrlForRef(ref) {
  return `${API_BASE}${encodeURIComponent(ref)}?translation=${TRANSLATION}`;
}

async function fetchRef(ref) {
  const url = buildUrlForRef(ref);

  while (true) {
    const response = await fetchJson(url);
    if (response.ok) {
      return response;
    }

    if (response.status === 429) {
      const retryAfterSeconds = Number(response.retryAfter || 0);
      const waitMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 10000;
      console.warn(`  WARN ${ref}: rate limited (429). Waiting ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }

    return response;
  }
}

function looksLikeVerseLookupFromChapterRequest(requestedChapter, responseJson) {
  const reference = String(responseJson?.reference || '');
  const verses = Array.isArray(responseJson?.verses) ? responseJson.verses : [];
  if (!reference.includes(':')) {
    return false;
  }
  if (verses.length !== 1) {
    return false;
  }

  const chapter = Number(verses[0]?.chapter);
  const verse = Number(verses[0]?.verse);
  return chapter === 1 && verse === requestedChapter;
}

async function verseExistsForSingleChapterBook(bookApiName, verseNumber) {
  const verse = Number(verseNumber);
  if (!Number.isFinite(verse) || verse <= 0) {
    return false;
  }

  const ref = `${bookApiName} 1:${verse}`;
  const response = await fetchRef(ref);
  return response.ok;
}

async function findMaxVerseForSingleChapterBook(bookApiName) {
  // Exponential search to find an upper bound, then binary search for the last verse.
  let lo = 1;
  let hi = 1;

  while (await verseExistsForSingleChapterBook(bookApiName, hi)) {
    lo = hi;
    hi *= 2;

    // Safety bound: no 1-chapter book in the Protestant canon is anywhere near this size.
    if (hi > 500) {
      break;
    }

    await sleep(150);
  }

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await verseExistsForSingleChapterBook(bookApiName, mid)) {
      lo = mid;
    } else {
      hi = mid;
    }
    await sleep(150);
  }

  return lo;
}

function writeProgress(data) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function loadExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log(`Generating WEB verse counts via bible-api.com -> ${OUTPUT_PATH}`);
  console.log('This will take a few minutes (1189 chapters). Please be polite to the API.');
  if (FORCE) {
    console.log('Force mode enabled: regenerating all books in the output file.');
  }

  const existing = loadExisting();
  const output = existing && existing.translationId === TRANSLATION
    ? existing
    : {
        translationId: TRANSLATION,
        generatedAt: null,
        source: 'bible-api.com',
        books: {},
      };

  for (const book of BOOKS) {
    if (!FORCE && output.books[book.id] && output.books[book.id].chapters) {
      continue;
    }

    console.log(`\n[${book.id}] ${book.name}`);
    const chapters = {};
    let chapter = 1;
    let consecutiveFailures = 0;

    while (chapter <= 200) {
      const ref = `${book.apiName} ${chapter}`;

      const response = await fetchRef(ref);
      if (!response.ok) {
        consecutiveFailures += 1;

        if (response.status === 404 || response.status === 400) {
          // End of book.
          break;
        }

        // Transient error: back off and retry a little.
        console.warn(`  WARN chapter ${chapter}: HTTP ${response.status}`);
        if (consecutiveFailures >= 3) {
          throw new Error(
            `Too many failures fetching ${ref} (last status ${response.status}).`
          );
        }

        await sleep(800);
        continue;
      }

      consecutiveFailures = 0;
      const verses = Array.isArray(response.json?.verses) ? response.json.verses : null;
      if (!verses || verses.length === 0) {
        console.warn(`  WARN chapter ${chapter}: no verses array`);
        break;
      }

      // Single-chapter books are ambiguous on bible-api.com:
      // "Obadiah 1" returns verse 1 (reference "Obadiah 1:1") rather than the chapter.
      // Detect that case and compute the verse count by probing verses directly.
      if (looksLikeVerseLookupFromChapterRequest(chapter, response.json)) {
        if (chapter !== 1) {
          break;
        }

        console.log('  Detected single-chapter book behavior. Finding verse count...');
        const maxVerse = await findMaxVerseForSingleChapterBook(book.apiName);
        chapters['1'] = maxVerse;
        console.log(`  Single chapter total verses: ${maxVerse}`);
        break;
      }

      const returnedChapter = Number(verses[0]?.chapter);
      if (Number.isFinite(returnedChapter) && returnedChapter !== chapter) {
        console.warn(`  WARN chapter ${chapter}: api returned chapter ${returnedChapter}. Stopping.`);
        break;
      }

      chapters[String(chapter)] = verses.length;
      if (chapter % 10 === 0) {
        console.log(`  ... chapter ${chapter}`);
      }

      chapter += 1;
      // Avoid hammering the API and triggering 429 responses.
      await sleep(450);
    }

    if (Object.keys(chapters).length === 0) {
      throw new Error(`No chapters were discovered for ${book.id} (${book.name}).`);
    }

    output.books[book.id] = {
      id: book.id,
      name: book.name,
      testament: book.testament,
      chapters,
    };

    writeProgress(output);
  }

  output.generatedAt = new Date().toISOString();
  writeProgress(output);

  const totals = { OT: 0, NT: 0, all: 0 };
  for (const book of Object.values(output.books)) {
    let bookTotal = 0;
    for (const count of Object.values(book.chapters)) {
      bookTotal += Number(count || 0);
    }

    totals.all += bookTotal;
    if (book.testament === 'OT') totals.OT += bookTotal;
    if (book.testament === 'NT') totals.NT += bookTotal;
  }

  console.log('\nDone.');
  console.log(`Total verses (computed from chapter counts): ${totals.all} (OT ${totals.OT}, NT ${totals.NT})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
