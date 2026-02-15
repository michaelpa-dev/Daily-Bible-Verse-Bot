const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { issueTrackerUrl } = require('../config.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { getBuildInfo } = require('../services/buildInfo.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get support and report issues'),
  async execute(interaction) {
    await addCommandExecution();
    const buildInfo = getBuildInfo();

    const supportEmbed = new EmbedBuilder()
      .setTitle('Need Support or Found a Bug?')
      .setColor('#FF0000')
      .setTimestamp()
      .setDescription(
        `If you need support, found a bug, or want to make a feature request, please open an issue at: ${issueTrackerUrl}`
      )
      .setFooter({ text: `Bot: ${buildInfo.releaseTag} (${buildInfo.gitSha})` })
      .setThumbnail(interaction.client.user.displayAvatarURL());

    await interaction.reply({ embeds: [supportEmbed], ephemeral: true });
  },
};
