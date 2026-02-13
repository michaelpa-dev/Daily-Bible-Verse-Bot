const test = require('node:test');
const assert = require('node:assert/strict');
const { __private } = require('../js/config.js');

const { resolveBotToken, resolveRuntimeEnvironment } = __private;

test('resolveRuntimeEnvironment prefers DEPLOY_ENVIRONMENT over NODE_ENV', () => {
  const runtimeEnvironment = resolveRuntimeEnvironment({
    DEPLOY_ENVIRONMENT: 'canary',
    NODE_ENV: 'production',
  });

  assert.equal(runtimeEnvironment, 'canary');
});

test('resolveBotToken prefers BOT_TOKEN environment variable', () => {
  const token = resolveBotToken({
    environment: {
      BOT_TOKEN: 'env-token',
      NODE_ENV: 'production',
    },
    primary: {
      botToken: 'config-token',
    },
  });

  assert.equal(token, 'env-token');
});

test('resolveBotToken blocks config token in managed environments by default', () => {
  const token = resolveBotToken({
    environment: {
      NODE_ENV: 'production',
    },
    primary: {
      botToken: 'config-token',
    },
  });

  assert.equal(token, '');
});

test('resolveBotToken allows config token in local development', () => {
  const token = resolveBotToken({
    environment: {
      NODE_ENV: 'development',
    },
    primary: {
      botToken: 'config-token',
    },
  });

  assert.equal(token, 'config-token');
});

test('resolveBotToken allows explicit override for managed environments', () => {
  const token = resolveBotToken({
    environment: {
      NODE_ENV: 'production',
      ALLOW_FILE_BOT_TOKEN: 'true',
    },
    primary: {
      botToken: 'config-token',
    },
  });

  assert.equal(token, 'config-token');
});
