const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBootstrapSummaryMessage,
  truncateText,
} = require('../js/services/botOps.js');

test('truncateText keeps short strings and truncates long strings', () => {
  assert.equal(truncateText('abc', 10), 'abc');
  assert.equal(truncateText('0123456789', 6), '012...');
});

test('buildBootstrapSummaryMessage includes counts and sections', () => {
  const report = {
    created: ['Role: Maintainer'],
    updated: ['Overwrite: @everyone on #welcome'],
    unchanged: ['Channel exists: #welcome'],
    warnings: ['Missing channel #bot-logs'],
  };

  const output = buildBootstrapSummaryMessage('dry-run', report);
  assert.match(output, /DRY-RUN summary/i);
  assert.match(output, /Created: 1/);
  assert.match(output, /Updated: 1/);
  assert.match(output, /Warnings: 1/);
  assert.match(output, /Role: Maintainer/);
});
