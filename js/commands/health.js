const { SlashCommandBuilder } = require('discord.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { buildHealthEmbed } = require('../services/botOps.js');
const { requireOwnerOrMaintainer } = require('../services/permissionUtils.js');
const { getSnapshot } = require('../services/runtimeHealth.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Show bot runtime health information'),
  async execute(interaction) {
    await addCommandExecution();

    const authorized = await requireOwnerOrMaintainer(interaction);
    if (!authorized) {
      return;
    }

    const snapshot = getSnapshot(interaction.client);
    const embed = buildHealthEmbed(interaction.client);

    embed.addFields(
      { name: 'Discord Ready', value: snapshot.discord.ready ? 'Yes' : 'No', inline: true },
      { name: 'WS Status', value: snapshot.discord.wsStatusName || 'Unknown', inline: true },
      {
        name: 'WS Ping',
        value: snapshot.discord.wsPingMs != null ? `${snapshot.discord.wsPingMs}ms` : 'N/A',
        inline: true,
      },
      {
        name: 'Last Command',
        value: snapshot.interactions.lastCommandAt
          ? `${snapshot.interactions.lastCommandName || 'unknown'} at ${snapshot.interactions.lastCommandAt}`
          : 'No commands yet',
        inline: false,
      },
      {
        name: 'Last Disconnect',
        value: snapshot.discord.lastDisconnectAt
          ? `${snapshot.discord.lastDisconnectAt}${snapshot.discord.lastDisconnectReason ? ` (${snapshot.discord.lastDisconnectReason})` : ''}`
          : 'N/A',
        inline: false,
      },
      {
        name: 'Watchdog',
        value: snapshot.watchdog.lastOkAt
          ? `lastOk=${snapshot.watchdog.lastOkAt}${snapshot.watchdog.lastExitAt ? `, lastExit=${snapshot.watchdog.lastExitAt}` : ''}`
          : 'No watchdog ticks yet',
        inline: false,
      }
    );

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
