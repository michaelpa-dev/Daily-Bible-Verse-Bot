const test = require('node:test');
const assert = require('node:assert/strict');

const { parseScriptureReference } = require('../js/services/scriptureReference.js');

test('parseScriptureReference supports discontiguous ranges (matt 25:31-33,46)', () => {
  const parsed = parseScriptureReference('matt 25:31-33,46');

  assert.equal(parsed.bookId, 'MAT');
  assert.equal(parsed.chapter, 25);
  assert.equal(parsed.verseSpec, '31-33,46');
  assert.deepEqual(parsed.verses.slice(0, 4), [31, 32, 33, 46]);
  assert.equal(parsed.chapterWhole, false);
});

test('parseScriptureReference supports numeric prefixes (1 cor 13:4-7)', () => {
  const parsed = parseScriptureReference('1 cor 13:4-7');

  assert.equal(parsed.bookId, '1CO');
  assert.equal(parsed.chapter, 13);
  assert.equal(parsed.verseSpec, '4-7');
  assert.deepEqual(parsed.verses, [4, 5, 6, 7]);
});

test('parseScriptureReference supports chapter-only references (Ps 23)', () => {
  const parsed = parseScriptureReference('Ps 23');

  assert.equal(parsed.bookId, 'PSA');
  assert.equal(parsed.chapter, 23);
  assert.equal(parsed.chapterWhole, true);
  assert.equal(parsed.verseSpec, null);
});

test('parseScriptureReference supports multi-word books (Song of Solomon 2:8)', () => {
  const parsed = parseScriptureReference('Song of Solomon 2:8');

  assert.equal(parsed.bookId, 'SNG');
  assert.equal(parsed.chapter, 2);
  assert.equal(parsed.verseSpec, '8');
  assert.deepEqual(parsed.verses, [8]);
});
