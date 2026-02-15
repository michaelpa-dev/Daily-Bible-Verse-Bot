const test = require('node:test');
const assert = require('node:assert/strict');

const { createReadSession } = require('../js/services/readSessions.js');
const { formatPassageLines } = require('../js/services/passageFormatter.js');

function buildFakePassage(verseCount = 60) {
  const verses = [];
  for (let i = 1; i <= verseCount; i += 1) {
    verses.push({
      book_id: 'JHN',
      book_name: 'John',
      chapter: 3,
      verse: i,
      text: `Verse ${i} ${'lorem ipsum '.repeat(12)}`.trim(),
    });
  }

  return {
    reference: 'John 3',
    translation_id: 'web',
    translation_name: 'World English Bible',
    translation_note: 'Public Domain',
    verses,
    text: verses.map((v) => v.text).join(' '),
  };
}

test('/read paging uses smaller pages and never splits verse lines', async () => {
  const fakePassage = buildFakePassage(70);

  const fetchImpl = async () =>
    new Response(JSON.stringify(fakePassage), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const session = await createReadSession({
    userId: '123',
    reference: 'JHN 3',
    fetchImpl,
  });
  assert.equal(session.kind, 'ready');
  const active = session.session;

  assert.ok(Array.isArray(active.pages));
  assert.ok(active.pages.length >= 2, 'expected multiple pages for long chapter');

  // Page size target is ~1700 chars; never exceed it.
  for (const page of active.pages) {
    assert.ok(page.length <= 1700, `page exceeded max chars: ${page.length}`);
  }

  // Ensure verse lines appear intact in exactly one page.
  const expectedLines = formatPassageLines({
    verses: fakePassage.verses.map((verse) => ({
      bookId: verse.book_id,
      bookName: verse.book_name,
      chapter: verse.chapter,
      verse: verse.verse,
      text: verse.text,
    })),
  });

  for (const line of expectedLines) {
    const hits = active.pages.filter((page) => page.split('\n').includes(line)).length;
    assert.equal(hits, 1, `expected verse line to appear once: ${line.slice(0, 30)}...`);
  }
});
