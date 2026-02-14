const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveBook } = require('../js/services/bookResolver.js');

test('resolveBook handles common ordinal + abbreviation inputs', () => {
  assert.equal(resolveBook('1 samuel').kind, 'resolved');
  assert.equal(resolveBook('1 samuel').bookId, '1SA');

  assert.equal(resolveBook('1 sam').kind, 'resolved');
  assert.equal(resolveBook('1 sam').bookId, '1SA');

  assert.equal(resolveBook('2 sam').kind, 'resolved');
  assert.equal(resolveBook('2 sam').bookId, '2SA');

  assert.equal(resolveBook('i sam').kind, 'resolved');
  assert.equal(resolveBook('i sam').bookId, '1SA');
});

test('resolveBook handles punctuation/spacing variations', () => {
  assert.equal(resolveBook('1samuel').kind, 'resolved');
  assert.equal(resolveBook('1samuel').bookId, '1SA');

  assert.equal(resolveBook('1-sam').kind, 'resolved');
  assert.equal(resolveBook('1-sam').bookId, '1SA');

  assert.equal(resolveBook('1 sam.').kind, 'resolved');
  assert.equal(resolveBook('1 sam.').bookId, '1SA');
});

test('resolveBook resolves multi-word books and common aliases', () => {
  assert.equal(resolveBook('song of songs').kind, 'resolved');
  assert.equal(resolveBook('song of songs').bookId, 'SNG');

  assert.equal(resolveBook('ps').kind, 'resolved');
  assert.equal(resolveBook('ps').bookId, 'PSA');

  assert.equal(resolveBook('psalm').kind, 'resolved');
  assert.equal(resolveBook('psalm').bookId, 'PSA');

  assert.equal(resolveBook('psalms').kind, 'resolved');
  assert.equal(resolveBook('psalms').bookId, 'PSA');

  assert.equal(resolveBook('jn').kind, 'resolved');
  assert.equal(resolveBook('jn').bookId, 'JHN');

  assert.equal(resolveBook('john').kind, 'resolved');
  assert.equal(resolveBook('john').bookId, 'JHN');
});

test('resolveBook returns candidates for ambiguous inputs', () => {
  const result = resolveBook('sam');
  assert.equal(result.kind, 'needs_confirmation');

  const ids = result.candidates.map((candidate) => candidate.bookId);
  assert.ok(ids.includes('1SA'));
  assert.ok(ids.includes('2SA'));
});

