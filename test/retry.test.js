const test = require('node:test');
const assert = require('node:assert/strict');

const { computeBackoffDelayMs, retryAsync } = require('../js/services/retry.js');

test('computeBackoffDelayMs grows exponentially when jitter is disabled', () => {
  assert.equal(
    computeBackoffDelayMs(1, { baseDelayMs: 100, factor: 2, maxDelayMs: 5000, jitter: false }),
    100
  );
  assert.equal(
    computeBackoffDelayMs(2, { baseDelayMs: 100, factor: 2, maxDelayMs: 5000, jitter: false }),
    200
  );
  assert.equal(
    computeBackoffDelayMs(3, { baseDelayMs: 100, factor: 2, maxDelayMs: 5000, jitter: false }),
    400
  );
});

test('retryAsync retries and eventually succeeds', async () => {
  let calls = 0;
  let retries = 0;

  const result = await retryAsync(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('transient');
      }
      return 'ok';
    },
    {
      maxAttempts: 3,
      shouldRetry: () => true,
      computeDelayMs: () => 0,
      onRetry: () => {
        retries += 1;
      },
    }
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.equal(retries, 2);
});

test('retryAsync stops immediately when shouldRetry returns false', async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      retryAsync(
        async () => {
          calls += 1;
          throw new Error('nope');
        },
        {
          maxAttempts: 3,
          shouldRetry: () => false,
          computeDelayMs: () => 0,
        }
      ),
    /nope/
  );

  assert.equal(calls, 1);
});
