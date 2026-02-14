const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BOT_STATUS_MARKER,
  BOT_STATUS_TITLE,
  buildBotStatusEmbed,
  buildBootstrapSummaryMessage,
  buildIssueCreationUrl,
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

test('buildIssueCreationUrl returns a GitHub issue link with prefilled fields', () => {
  const issueUrl = buildIssueCreationUrl({
    context: 'command',
    commandName: '/subscribe',
    userTag: 'tester (123)',
    errorSummary: 'something failed',
    correlationId: 'corr-123',
  });

  assert.match(issueUrl, /github\.com/);
  assert.match(issueUrl, /issues\/new/);

  const parsed = new URL(issueUrl);
  assert.equal(parsed.searchParams.get('labels'), 'bug');
  assert.match(parsed.searchParams.get('title') || '', /Bot Error/);
  assert.match(parsed.searchParams.get('body') || '', /Error context/);
  assert.match(parsed.searchParams.get('body') || '', /CorrelationId/i);
});

test('buildBotStatusEmbed uses embed format with marker footer', () => {
  const client = {
    uptime: 15000,
    guilds: { cache: { size: 1 } },
  };
  const embed = buildBotStatusEmbed(client);

  assert.equal(embed.data.title, BOT_STATUS_TITLE);
  assert.equal(embed.data.footer?.text, BOT_STATUS_MARKER);
  assert.ok(Array.isArray(embed.data.fields));
  assert.ok(embed.data.fields.some((field) => field.name === 'Uptime'));
});
