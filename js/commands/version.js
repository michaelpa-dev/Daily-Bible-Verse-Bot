const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { getBuildInfo } = require('../services/buildInfo.js');

function formatDiscordTimestamp(iso) {
  if (!iso) {
    return 'unknown';
  }

  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'unknown';
  }

  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show bot version metadata (tag, SHA, build/deploy time)'),
  async execute(interaction) {
    await addCommandExecution();
    const buildInfo = getBuildInfo();

    const embed = new EmbedBuilder()
      .setTitle('Build Version')
      .setColor('#2980b9')
      .setTimestamp()
      .addFields(
        { name: 'Release Tag', value: buildInfo.releaseTag, inline: true },
        { name: 'Package Version', value: buildInfo.packageVersion, inline: true },
        { name: 'Git SHA', value: buildInfo.gitSha, inline: true },
        {
          name: 'Environment',
          value: buildInfo.runtimeEnvironment,
          inline: true,
        },
        {
          name: 'Built At',
          value: formatDiscordTimestamp(buildInfo.builtAt),
          inline: true,
        },
        {
          name: 'Deployed At',
          value: formatDiscordTimestamp(buildInfo.deployedAt),
          inline: true,
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
