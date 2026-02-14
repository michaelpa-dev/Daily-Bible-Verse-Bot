const test = require('node:test');
const assert = require('node:assert/strict');

const { getReadingForDay } = require('../js/services/planEngine.js');

test('planEngine psalms-proverbs cycles chapters', () => {
  const plan = {
    planType: 'psalms-proverbs',
    paceType: 'chapters',
    paceValue: 2,
    scope: 'SpecificBooks',
    books: ['PSA', 'PRO'],
  };

  const day0 = getReadingForDay(plan, 0);
  assert.deepEqual(day0, [
    { bookId: 'PSA', chapter: 1, verseSpec: null },
    { bookId: 'PRO', chapter: 1, verseSpec: null },
  ]);

  const day150 = getReadingForDay(plan, 150);
  assert.equal(day150[0].chapter, 1);
});

test('planEngine gospels-30 starts at Matthew 1', () => {
  const plan = {
    planType: 'gospels-30',
    paceType: 'chapters',
    paceValue: 3,
    scope: 'SpecificBooks',
    books: ['MAT', 'MRK', 'LUK', 'JHN'],
  };

  const day0 = getReadingForDay(plan, 0);
  assert.equal(day0[0].bookId, 'MAT');
  assert.equal(day0[0].chapter, 1);
});

test('planEngine new-testament-90 starts at Matthew 1', () => {
  const plan = {
    planType: 'new-testament-90',
    paceType: 'chapters',
    paceValue: 3,
    scope: 'NT',
    books: [],
  };

  const day0 = getReadingForDay(plan, 0);
  assert.equal(day0[0].bookId, 'MAT');
  assert.equal(day0[0].chapter, 1);
});

