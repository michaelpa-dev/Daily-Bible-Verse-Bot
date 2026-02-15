const test = require('node:test');
const assert = require('node:assert/strict');
const { isOwnerOrMaintainer, memberHasRoleByName } = require('../js/services/permissionUtils.js');

function buildMemberWithRoles(roleNames) {
  const roles = roleNames.map((name) => ({ name }));
  return {
    roles: {
      cache: {
        some: (predicate) => roles.some(predicate),
      },
    },
  };
}

test('memberHasRoleByName resolves case-insensitive role names', () => {
  const member = buildMemberWithRoles(['Contributor', 'Maintainer']);
  assert.equal(memberHasRoleByName(member, 'maintainer'), true);
  assert.equal(memberHasRoleByName(member, 'reviewer'), false);
});

test('isOwnerOrMaintainer grants owner access', () => {
  const interaction = {
    guild: { ownerId: 'owner-123' },
    user: { id: 'owner-123' },
    member: buildMemberWithRoles([]),
  };

  assert.equal(isOwnerOrMaintainer(interaction), true);
});

test('isOwnerOrMaintainer grants Maintainer role access', () => {
  const interaction = {
    guild: { ownerId: 'owner-123' },
    user: { id: 'member-1' },
    member: buildMemberWithRoles(['maintainer']),
  };

  assert.equal(isOwnerOrMaintainer(interaction), true);
});

test('isOwnerOrMaintainer denies non-owner non-maintainer access', () => {
  const interaction = {
    guild: { ownerId: 'owner-123' },
    user: { id: 'member-1' },
    member: buildMemberWithRoles(['Contributor']),
  };

  assert.equal(isOwnerOrMaintainer(interaction), false);
});
