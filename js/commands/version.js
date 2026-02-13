const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { getBuildInfo } = require('../services/buildInfo.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show bot semantic version and git SHA'),
  async execute(interaction) {
    await addCommandExecution();
    const { version, gitSha } = getBuildInfo();

    const embed = new EmbedBuilder()
      .setTitle('Build Version')
      .setColor('#2980b9')
      .setTimestamp()
      .addFields(
        { name: 'Version', value: version, inline: true },
        { name: 'Git SHA', value: gitSha, inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
