const test = require('node:test');
const assert = require('node:assert/strict');

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createPaginatedMessage } = require('../js/services/paginationInteractions.js');

test('createPaginatedMessage preserves extra components for single-page messages', () => {
  const extraRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('unit-test-extra')
      .setLabel('Extra')
      .setStyle(ButtonStyle.Primary),
  );

  const { components } = createPaginatedMessage({
    kind: 'unit-test',
    userId: 'user-1',
    pages: ['hello world'],
    footer: 'footer',
    extraComponents: [extraRow],
  });

  assert.ok(Array.isArray(components));
  assert.ok(components.length >= 2);
  assert.ok(components.includes(extraRow));
});
