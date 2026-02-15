const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePlanOwnerContext } = require('../js/services/planTarget.js');

test('resolvePlanOwnerContext defaults to server target in guilds', () => {
  const resolved = resolvePlanOwnerContext({ guildId: 'guild-1', userId: 'user-1' });

  assert.deepEqual(resolved, {
    target: 'server',
    ownerType: 'guild',
    ownerId: 'guild-1',
  });
});

test('resolvePlanOwnerContext supports target=me in guilds (personal DM plans)', () => {
  const resolved = resolvePlanOwnerContext({ guildId: 'guild-1', userId: 'user-1', target: 'me' });

  assert.deepEqual(resolved, {
    target: 'me',
    ownerType: 'user',
    ownerId: 'user-1',
  });
});

test('resolvePlanOwnerContext defaults to me target when no guild context exists', () => {
  const resolved = resolvePlanOwnerContext({ userId: 'user-1' });

  assert.deepEqual(resolved, {
    target: 'me',
    ownerType: 'user',
    ownerId: 'user-1',
  });
});

test('resolvePlanOwnerContext rejects invalid targets', () => {
  assert.throws(
    () => resolvePlanOwnerContext({ guildId: 'guild-1', userId: 'user-1', target: 'unknown' }),
    /Invalid target/i
  );
});

test('resolvePlanOwnerContext rejects server target outside of a guild', () => {
  assert.throws(
    () => resolvePlanOwnerContext({ userId: 'user-1', target: 'server' }),
    /Server plans can only be managed/i
  );
});
