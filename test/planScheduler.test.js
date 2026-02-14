const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanupSandbox,
  createTempDatabaseSandbox,
  loadDbModulesForSandbox,
} = require('./helpers/dbTestUtils.js');

test('planScheduler postPlanTick respects future startDate', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, planDB } = loadDbModulesForSandbox(sandbox);
  const planScheduler = require('../js/services/planScheduler.js');

  try {
    const plan = await planDB.upsertPlan({
      ownerType: 'guild',
      ownerId: 'guild-startdate',
      channelId: 'channel-startdate',
      planType: 'custom',
      scope: 'NT',
      books: [],
      paceType: 'chapters',
      paceValue: 1,
      timezone: 'UTC',
      postTime: '08:00',
      // Far-future date ensures localDate < startDate, independent of when the test runs.
      startDate: '9999-12-31',
    });

    let fetchCalled = false;
    const client = {
      channels: {
        fetch: async () => {
          fetchCalled = true;
          return null;
        },
      },
    };

    await planScheduler.__private.postPlanTick(client, plan.id);

    assert.equal(fetchCalled, false);

    const reloaded = await planDB.getPlanById(plan.id);
    assert.equal(reloaded.status, 'active');
    assert.equal(reloaded.dayIndex, 0);
    assert.equal(reloaded.lastPostedOn, null);
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});

test('planScheduler postPlanTick marks plan stopped when readings complete', async () => {
  const sandbox = createTempDatabaseSandbox();
  const { database, planDB } = loadDbModulesForSandbox(sandbox);
  const planScheduler = require('../js/services/planScheduler.js');

  try {
    const plan = await planDB.upsertPlan({
      ownerType: 'guild',
      ownerId: 'guild-complete',
      channelId: 'channel-complete',
      planType: 'custom',
      // Empty SpecificBooks yields no chapter refs, so the plan is immediately "complete".
      scope: 'SpecificBooks',
      books: [],
      paceType: 'chapters',
      paceValue: 1,
      timezone: 'UTC',
      postTime: '08:00',
      startDate: '2000-01-01',
    });

    await planScheduler.__private.postPlanTick({}, plan.id);

    const reloaded = await planDB.getPlanById(plan.id);
    assert.equal(reloaded.status, 'stopped');
  } finally {
    await cleanupSandbox(sandbox, database);
  }
});

