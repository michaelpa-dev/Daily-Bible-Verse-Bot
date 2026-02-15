const test = require('node:test');
const assert = require('node:assert/strict');

const { getBookById } = require('../js/constants/books.js');
const {
  getTotals,
  pickRandomVerseFromBook,
  pickRandomVerseFromTestament,
} = require('../js/constants/webVerseCounts.js');

test('webVerseCounts totals look sane (OT + NT = all)', () => {
  const totals = getTotals();
  assert.ok(totals.OT > 0);
  assert.ok(totals.NT > 0);
  assert.equal(totals.OT + totals.NT, totals.all);
});

test('pickRandomVerseFromTestament(OT) returns an OT verse', () => {
  const verse = pickRandomVerseFromTestament('OT', { offset: 0 });
  const book = getBookById(verse.bookId);
  assert.equal(book?.testament, 'OT');
  assert.equal(verse.bookId, 'GEN');
  assert.equal(verse.chapter, 1);
  assert.equal(verse.verse, 1);
});

test('pickRandomVerseFromTestament(NT) returns an NT verse', () => {
  const verse = pickRandomVerseFromTestament('NT', { offset: 0 });
  const book = getBookById(verse.bookId);
  assert.equal(book?.testament, 'NT');
  assert.equal(verse.bookId, 'MAT');
  assert.equal(verse.chapter, 1);
  assert.equal(verse.verse, 1);
});

test('pickRandomVerseFromBook maps offsets deterministically', () => {
  const verse = pickRandomVerseFromBook('JHN', { offset: 0 });
  assert.deepEqual(verse, { bookId: 'JHN', chapter: 1, verse: 1 });
});
