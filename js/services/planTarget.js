function resolvePlanOwnerContext(input) {
  const guildId = input && input.guildId ? String(input.guildId).trim() : '';
  const userId = input && input.userId ? String(input.userId).trim() : '';

  if (!userId) {
    throw new Error('Internal error: userId was not provided in interaction context.');
  }

  const rawTarget = input && input.target != null ? String(input.target).trim().toLowerCase() : '';
  const defaultTarget = guildId ? 'server' : 'me';
  const target = rawTarget || defaultTarget;

  if (target === 'me') {
    return {
      target,
      ownerType: 'user',
      ownerId: userId,
    };
  }

  if (target === 'server') {
    if (!guildId) {
      throw new Error('Server plans can only be managed from within a server.');
    }

    return {
      target,
      ownerType: 'guild',
      ownerId: guildId,
    };
  }

  throw new Error(`Invalid target "${target}". Use "server" or "me".`);
}

module.exports = {
  resolvePlanOwnerContext,
};
