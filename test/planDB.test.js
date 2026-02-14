const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanupSandbox,
  createTempDatabaseSandbox,
  loadDbModulesForSandbox,
} = require('./helpers/dbTestUtils.js');

test('planDB upserts and loads a guild plan', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, planDB } = loadDbModulesForSandbox(sandbox);

  try {
    const plan = await planDB.upsertPlan({
      ownerType: 'guild',
      ownerId: 'guild-1',
      channelId: 'channel-1',
      planType: 'custom',
      scope: 'NT',
      books: [],
      paceType: 'chapters',
      paceValue: 2,
      timezone: 'America/New_York',
      postTime: '08:00',
      startDate: '2026-02-14',
    });

    assert.equal(plan.ownerType, 'guild');
    assert.equal(plan.ownerId, 'guild-1');
    assert.equal(plan.channelId, 'channel-1');
    assert.equal(plan.status, 'active');
    assert.equal(plan.dayIndex, 0);

    const reloaded = await planDB.getPlan('guild', 'guild-1');
    assert.equal(reloaded.id, plan.id);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});

test('planDB skipDays increments dayIndex', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, planDB } = loadDbModulesForSandbox(sandbox);

  try {
    const plan = await planDB.upsertPlan({
      ownerType: 'user',
      ownerId: 'user-1',
      channelId: null,
      planType: 'custom',
      scope: 'NT',
      books: [],
      paceType: 'chapters',
      paceValue: 1,
      timezone: 'America/New_York',
      postTime: '08:00',
      startDate: '2026-02-14',
    });

    await planDB.skipDays(plan.id, 3);
    const reloaded = await planDB.getPlanById(plan.id);
    assert.equal(reloaded.dayIndex, 3);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});

test('planDB markComplete updates streak when previousDay=true', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, planDB } = loadDbModulesForSandbox(sandbox);

  try {
    const plan = await planDB.upsertPlan({
      ownerType: 'user',
      ownerId: 'user-2',
      channelId: null,
      planType: 'custom',
      scope: 'NT',
      books: [],
      paceType: 'chapters',
      paceValue: 1,
      timezone: 'America/New_York',
      postTime: '08:00',
      startDate: '2026-02-14',
    });

    const first = await planDB.markComplete(plan.id, '2026-02-14');
    assert.equal(first.streak, 1);

    const second = await planDB.markComplete(plan.id, '2026-02-15', { previousDay: true });
    assert.equal(second.streak, 2);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});

