const { SlashCommandBuilder } = require('discord.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { buildHealthEmbed } = require('../services/botOps.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Show bot runtime health information'),
  async execute(interaction) {
    await addCommandExecution();
    await interaction.reply({
      embeds: [buildHealthEmbed(interaction.client)],
      ephemeral: true,
    });
  },
};
