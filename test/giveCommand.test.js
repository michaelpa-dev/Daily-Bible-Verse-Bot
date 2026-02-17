const test = require('node:test');
const assert = require('node:assert/strict');

const give = require('../js/commands/give.js');

function createInteraction(overrides = {}) {
  const interaction = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1' },
    client: { user: { id: 'bot-1' } },
    channel: {
      permissionsFor: () => ({ has: () => true }),
    },
    replied: false,
    replyCalls: [],
    async reply(payload) {
      this.replied = true;
      this.replyCalls.push(payload);
    },
    ...overrides,
  };

  return interaction;
}

test('/give command is registered as give', () => {
  assert.equal(give.data.name, 'give');
});

test('/give embed contains the sponsors link and crypto addresses', () => {
  const embed = give.__private.buildGiveSupportEmbed({
    releaseTag: 'canary-test',
    gitSha: 'deadbeef',
  });
  const json = embed.toJSON();

  assert.equal(json.title, 'Support Daily Bible Verse');
  const fields = json.fields || [];
  const sponsorsField = fields.find((field) => field.name === 'GitHub Sponsors');
  assert.ok(sponsorsField);
  assert.match(sponsorsField.value, /github\.com\/sponsors\/michaelpa-dev/);

  const cryptoField = fields.find((field) => field.name === 'Crypto');
  assert.ok(cryptoField);
  assert.match(cryptoField.value, /BTC:/);
  assert.match(cryptoField.value, /ETH:/);
  assert.match(cryptoField.value, /XLM:/);
  assert.match(cryptoField.value, /XRP:/);
});

test('/give falls back to plain text when Embed Links permission is missing', async () => {
  const interaction = createInteraction({
    channel: {
      permissionsFor: () => ({ has: () => false }),
    },
  });

  await give.__private.replyGive(interaction);

  assert.equal(interaction.replyCalls.length, 1);
  const payload = interaction.replyCalls[0];
  assert.ok(typeof payload.content === 'string');
  assert.match(payload.content, /Support Daily Bible Verse/);
  assert.match(payload.content, /GitHub Sponsors/);
  assert.equal(Array.isArray(payload.components), true);
  assert.equal(payload.components.length, 1);
});

test('/give replies with an embed when Embed Links permission is present', async () => {
  const interaction = createInteraction();

  await give.__private.replyGive(interaction);

  assert.equal(interaction.replyCalls.length, 1);
  const payload = interaction.replyCalls[0];
  assert.ok(Array.isArray(payload.embeds));
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].data.title, 'Support Daily Bible Verse');
  assert.equal(Array.isArray(payload.components), true);
  assert.equal(payload.components.length, 1);
});
