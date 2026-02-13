const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { requireOwnerOrMaintainer } = require('../services/permissionUtils.js');
const {
  getChangelogChannel,
  sendBotLogMessage,
} = require('../services/botOps.js');
const { getBuildInfo } = require('../services/buildInfo.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('release-notes')
    .setDescription('Post formatted release notes to #changelog')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('Release note details')
        .setRequired(true)
        .setMaxLength(2000)
    ),
  async execute(interaction) {
    await addCommandExecution();

    const authorized = await requireOwnerOrMaintainer(interaction);
    if (!authorized) {
      return;
    }

    const changelogChannel = await getChangelogChannel(interaction.guild);
    if (!changelogChannel) {
      await interaction.reply({
        content: 'Unable to find #changelog in this server.',
        ephemeral: true,
      });
      return;
    }

    const noteText = interaction.options.getString('text', true);
    const buildInfo = getBuildInfo();
    const embed = new EmbedBuilder()
      .setTitle('Release Notes')
      .setColor('#2c3e50')
      .setTimestamp()
      .setDescription(noteText)
      .addFields(
        {
          name: 'Published By',
          value: `${interaction.user.username} (${interaction.user.id})`,
          inline: true,
        },
        { name: 'Version', value: buildInfo.version, inline: true },
        { name: 'Git SHA', value: buildInfo.gitSha, inline: true }
      );

    await changelogChannel.send({ embeds: [embed] });
    await interaction.reply({
      content: 'Release notes posted to #changelog.',
      ephemeral: true,
    });

    await sendBotLogMessage(interaction.client, interaction.guildId, {
      content:
        `Release notes posted by ${interaction.user.username} in #${changelogChannel.name}`,
    });
  },
};
