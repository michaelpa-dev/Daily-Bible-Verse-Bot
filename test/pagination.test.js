const test = require('node:test');
const assert = require('node:assert/strict');

const { paginateLines } = require('../js/services/pagination.js');

test('paginateLines does not split logical lines across pages', () => {
  const lines = [
    '**1** In the beginning God created the heavens and the earth.',
    '**2** The earth was formless and empty.',
    '**3** God said, "Let there be light."',
  ];

  // Keep pages small enough to force pagination, but large enough to avoid truncating any line.
  const pages = paginateLines(lines, { maxChars: 90 });
  assert.ok(pages.length >= 2);

  // Each original line should appear as a complete line in exactly one page.
  for (const line of lines) {
    const hits = pages.filter((page) => page.split('\n').includes(line)).length;
    assert.equal(hits, 1);
  }
});

test('paginateLines truncates a single overlong line instead of splitting it', () => {
  const longLine = `**1** ${'a'.repeat(200)}`;
  const pages = paginateLines([longLine], { maxChars: 80 });

  assert.equal(pages.length, 1);
  assert.ok(pages[0].endsWith('...'));
  assert.ok(pages[0].length <= 80);
});
