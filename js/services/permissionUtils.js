const { MAINTAINER_ROLE_NAME } = require('../constants/devServerSpec.js');

function memberHasRoleByName(member, roleName) {
  if (!member || !member.roles || !member.roles.cache) {
    return false;
  }

  return member.roles.cache.some(
    (role) => role.name.toLowerCase() === roleName.toLowerCase()
  );
}

function isOwnerOrMaintainer(interaction) {
  if (!interaction?.guild || !interaction?.user) {
    return false;
  }

  if (interaction.guild.ownerId === interaction.user.id) {
    return true;
  }

  return memberHasRoleByName(interaction.member, MAINTAINER_ROLE_NAME);
}

async function requireOwnerOrMaintainer(interaction, options = {}) {
  if (isOwnerOrMaintainer(interaction)) {
    return true;
  }

  const message =
    options.message ||
    'Only the server owner or members with the Maintainer role can use this command.';

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, ephemeral: true });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }

  return false;
}

module.exports = {
  isOwnerOrMaintainer,
  memberHasRoleByName,
  requireOwnerOrMaintainer,
};
