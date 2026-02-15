const test = require('node:test');
const assert = require('node:assert/strict');

const { runCommandSafely } = require('../js/services/commandRunner.js');

function createInteraction(overrides = {}) {
  const interaction = {
    commandName: 'test',
    replied: false,
    deferred: false,
    replyCalls: [],
    followUpCalls: [],
    async reply(payload) {
      this.replied = true;
      this.replyCalls.push(payload);
    },
    async followUp(payload) {
      this.followUpCalls.push(payload);
    },
    ...overrides,
  };

  return interaction;
}

test('runCommandSafely returns ok=true when command succeeds', async () => {
  const interaction = createInteraction();
  const command = {
    async execute() {},
  };

  const result = await runCommandSafely(interaction, command, {
    logCommandErrorFn: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(interaction.replyCalls.length, 0);
  assert.equal(interaction.followUpCalls.length, 0);
});

test('runCommandSafely logs and replies when command throws', async () => {
  const interaction = createInteraction();
  const command = {
    async execute() {
      throw new Error('boom');
    },
  };

  let logged = 0;
  const result = await runCommandSafely(interaction, command, {
    logCommandErrorFn: async () => {
      logged += 1;
    },
    friendlyMessage: 'friendly',
  });

  assert.equal(result.ok, false);
  assert.equal(logged, 1);
  assert.equal(interaction.replyCalls.length, 1);
  assert.deepEqual(interaction.replyCalls[0], { content: 'friendly', ephemeral: true });
});

test('runCommandSafely uses followUp when interaction already replied', async () => {
  const interaction = createInteraction({ replied: true });
  const command = {
    async execute() {
      throw new Error('boom');
    },
  };

  const result = await runCommandSafely(interaction, command, {
    logCommandErrorFn: async () => {},
    friendlyMessage: 'friendly',
  });

  assert.equal(result.ok, false);
  assert.equal(interaction.replyCalls.length, 0);
  assert.equal(interaction.followUpCalls.length, 1);
  assert.deepEqual(interaction.followUpCalls[0], { content: 'friendly', ephemeral: true });
});
