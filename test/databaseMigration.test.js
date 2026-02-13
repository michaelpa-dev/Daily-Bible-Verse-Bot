const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanupSandbox,
  createTempDatabaseSandbox,
  loadDbModulesForSandbox,
} = require('./helpers/dbTestUtils.js');

test('database initialization migrates legacy JSON subscription and stats files', async () => {
  const sandbox = createTempDatabaseSandbox();

  const legacySubscriptions = [
    { id: 'legacy-user-1' },
    { id: 'legacy-user-2', translation: 'kjv' },
  ];
  const legacyStats = {
    totalVersesSent: 7,
    totalCommandsExecuted: 9,
    activeGuilds: 2,
  };

  fs.writeFileSync(
    path.join(sandbox.legacyDir, 'subscribed_users.json'),
    JSON.stringify(legacySubscriptions, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(sandbox.legacyDir, 'stats.json'),
    JSON.stringify(legacyStats, null, 2),
    'utf8'
  );

  const { database, subscribeDB, statsDB } = loadDbModulesForSandbox(sandbox);

  try {
    const subscribedUsers = await subscribeDB.getSubscribedUsers();
    assert.equal(subscribedUsers.length, 2);

    const firstUser = subscribedUsers.find((user) => user.id === 'legacy-user-1');
    const secondUser = subscribedUsers.find((user) => user.id === 'legacy-user-2');
    assert.deepEqual(firstUser, { id: 'legacy-user-1', translation: 'web' });
    assert.deepEqual(secondUser, { id: 'legacy-user-2', translation: 'kjv' });

    const stats = await statsDB.getStats();
    assert.equal(stats.totalVersesSent, 7);
    assert.equal(stats.totalCommandsExecuted, 9);
    assert.equal(stats.activeGuilds, 2);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});
