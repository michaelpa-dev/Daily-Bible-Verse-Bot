const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanupSandbox,
  createTempDatabaseSandbox,
  loadDbModulesForSandbox,
} = require('./helpers/dbTestUtils.js');

test('statsDB tracks counts and derives subscribed users from subscriptions', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, subscribeDB, statsDB } = loadDbModulesForSandbox(sandbox);

  try {
    await subscribeDB.addSubscribedUser('user-1', 'web');
    await subscribeDB.addSubscribedUser('user-2', 'kjv');

    await statsDB.addVerseSent();
    await statsDB.addVerseSent();
    await statsDB.addCommandExecution();
    await statsDB.updateActiveGuilds({ guilds: { cache: { size: 3 } } });

    const stats = await statsDB.getStats();
    assert.equal(stats.subscribedUsersCount, 2);
    assert.equal(stats.totalVersesSent, 2);
    assert.equal(stats.totalCommandsExecuted, 1);
    assert.equal(stats.activeGuilds, 3);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});
