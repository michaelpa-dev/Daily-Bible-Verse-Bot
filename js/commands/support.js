const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { issueTrackerUrl, version } = require('../config.js');
const { addCommandExecution } = require('../db/statsDB.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get support and report issues'),
  async execute(interaction) {
    await addCommandExecution();

    const supportEmbed = new EmbedBuilder()
      .setTitle('Need Support or Found a Bug?')
      .setColor('#FF0000')
      .setTimestamp()
      .setDescription(
        `If you need support, found a bug, or want to make a feature request, please open an issue at: ${issueTrackerUrl}`
      )
      .setFooter({ text: `Bot Version: ${version}` })
      .setThumbnail(interaction.client.user.displayAvatarURL());

    await interaction.reply({ embeds: [supportEmbed], ephemeral: true });
  },
};
