const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanupSandbox,
  createTempDatabaseSandbox,
  loadDbModulesForSandbox,
} = require('./helpers/dbTestUtils.js');

test('subscribeDB stores subscriptions and translation preferences', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, subscribeDB } = loadDbModulesForSandbox(sandbox);

  try {
    await subscribeDB.addSubscribedUser('user-1', 'kjv');
    await subscribeDB.addSubscribedUser('user-2', 'darby');

    const subscribedUsers = await subscribeDB.getSubscribedUsers();
    assert.equal(subscribedUsers.length, 2);
    assert.deepEqual(subscribedUsers[0], { id: 'user-1', translation: 'kjv' });
    assert.deepEqual(subscribedUsers[1], { id: 'user-2', translation: 'darby' });

    assert.equal(await subscribeDB.isSubscribed('user-1'), true);
    assert.equal(await subscribeDB.isSubscribed('user-3'), false);

    await subscribeDB.setUserTranslation('user-1', 'webbe');
    const preferences = await subscribeDB.getUserPreferences('user-1');
    assert.deepEqual(preferences, { id: 'user-1', translation: 'webbe' });
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});

test('subscribeDB removal operations are consistent', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, subscribeDB } = loadDbModulesForSandbox(sandbox);

  try {
    await subscribeDB.addSubscribedUser('user-1', 'web');
    await subscribeDB.addSubscribedUser('user-2', 'kjv');

    await subscribeDB.removeSubscribedUser('user-1');
    assert.equal(await subscribeDB.isSubscribed('user-1'), false);
    assert.equal(await subscribeDB.isSubscribed('user-2'), true);

    await subscribeDB.removeAllSubscribedUsers();
    const subscribedUsers = await subscribeDB.getSubscribedUsers();
    assert.deepEqual(subscribedUsers, []);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});
