const { SlashCommandBuilder } = require('discord.js');

const { addCommandExecution } = require('../db/statsDB.js');
const { requireOwnerOrMaintainer } = require('../services/permissionUtils.js');
const { buildHealthEmbed } = require('../services/botOps.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show detailed bot status (maintainers only)'),
  async execute(interaction) {
    await addCommandExecution();

    const authorized = await requireOwnerOrMaintainer(interaction);
    if (!authorized) {
      return;
    }

    await interaction.reply({
      embeds: [buildHealthEmbed(interaction.client)],
      ephemeral: true,
    });
  },
};
