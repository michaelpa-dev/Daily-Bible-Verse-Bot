const test = require('node:test');
const assert = require('node:assert/strict');

const devBotLogs = require('../js/services/devBotLogs.js');

function createFakeClient(channel) {
  return {
    channels: {
      async fetch() {
        return channel;
      },
    },
    guilds: {
      cache: new Map(),
      async fetch() {
        return null;
      },
    },
  };
}

test('devBotLogs batches multiple entries into a single Discord message', async () => {
  const sent = [];
  const channel = {
    async send(payload) {
      sent.push(payload);
      return { id: String(sent.length) };
    },
  };

  devBotLogs.stop();
  devBotLogs.start(createFakeClient(channel), {
    config: {
      enabled: true,
      channelId: '123',
      guildId: 'g',
      level: 'info',
      flushIntervalMs: 10_000,
      maxBatchItems: 10,
      maxQueueItems: 100,
      maxMessageChars: 1900,
      coalesceWindowMs: 10_000,
      startupRetryAttempts: 1,
    },
  });

  devBotLogs.logEvent('info', 'test.one', { a: 1 }, 'hello');
  devBotLogs.logEvent('info', 'test.two', { b: 2 }, 'world');

  await devBotLogs.flush();

  assert.equal(sent.length, 1);
  assert.ok(String(sent[0].content || '').includes('test.one'));
  assert.ok(String(sent[0].content || '').includes('test.two'));
  assert.ok(String(sent[0].content || '').startsWith('```log'));
});

test('devBotLogs opens a circuit breaker after repeated send failures', async () => {
  const channel = {
    async send() {
      throw new Error('no perms');
    },
  };

  devBotLogs.stop();
  devBotLogs.start(createFakeClient(channel), {
    config: {
      enabled: true,
      channelId: '123',
      guildId: 'g',
      level: 'info',
      flushIntervalMs: 10_000,
      maxBatchItems: 5,
      maxQueueItems: 100,
      coalesceWindowMs: 10_000,
      startupRetryAttempts: 1,
    },
  });

  devBotLogs.logEvent('warn', 'test.fail', null, 'a');
  await devBotLogs.flush();
  devBotLogs.logEvent('warn', 'test.fail', null, 'b');
  await devBotLogs.flush();
  devBotLogs.logEvent('warn', 'test.fail', null, 'c');
  await devBotLogs.flush();

  const health = devBotLogs.getHealth();
  assert.ok(health.consecutiveFailures >= 3);
  assert.ok(health.circuitOpenUntil, 'expected circuitOpenUntil to be set');
});

