const test = require('node:test');
const assert = require('node:assert/strict');

const { __private } = require('../js/services/discordWatchdog.js');

test('watchdog does not exit when Discord is ready', () => {
  const decision = __private.evaluateDiscordWatchdogState(
    {
      now: 10_000,
      startedAt: 0,
      isReady: true,
      wsStatus: null,
      wsStatusChangedAt: 0,
    },
    {
      startupGraceMs: 120_000,
      maxStuckMs: 300_000,
    }
  );

  assert.deepEqual(decision, { shouldExit: false, reason: null });
});

test('watchdog does not exit during startup grace period', () => {
  const decision = __private.evaluateDiscordWatchdogState(
    {
      now: 50_000,
      startedAt: 0,
      isReady: false,
      wsStatus: 0,
      wsStatusChangedAt: 10_000,
    },
    {
      startupGraceMs: 120_000,
      maxStuckMs: 300_000,
    }
  );

  assert.deepEqual(decision, { shouldExit: false, reason: null });
});

test('watchdog triggers exit when stuck beyond maxStuckMs', () => {
  const decision = __private.evaluateDiscordWatchdogState(
    {
      now: 1_000_000,
      startedAt: 0,
      isReady: false,
      wsStatus: 0,
      wsStatusChangedAt: 1_000_000 - 300_000,
    },
    {
      startupGraceMs: 0,
      maxStuckMs: 300_000,
    }
  );

  assert.equal(decision.shouldExit, true);
  assert.match(decision.reason || '', /stuck/i);
});

