const test = require('node:test');
const assert = require('node:assert/strict');

const { createPaginatedMessage } = require('../js/services/paginationInteractions.js');

test('createPaginatedMessage preserves extra components for single-page messages', () => {
  const extra = { kind: 'extra-component' };

  const { components } = createPaginatedMessage({
    kind: 'unit-test',
    userId: 'user-1',
    pages: ['hello world'],
    footer: 'footer',
    extraComponents: [extra],
  });

  assert.ok(Array.isArray(components));
  assert.ok(components.length >= 2);
  assert.ok(components.includes(extra));
});

