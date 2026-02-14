const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getStats, addCommandExecution } = require('../db/statsDB.js');
const { version } = require('../config.js');

module.exports = {
  data: new SlashCommandBuilder().setName('stats').setDescription('Show bot statistics'),
  async execute(interaction) {
    await addCommandExecution();

    const stats = await getStats();
    const uptime = interaction.client.uptime || 0;

    const days = Math.floor(uptime / 86400000);
    const hours = Math.floor(uptime / 3600000) % 24;
    const minutes = Math.floor(uptime / 60000) % 60;
    const seconds = Math.floor(uptime / 1000) % 60;

    const statsEmbed = new EmbedBuilder()
      .setTitle('Bot Statistics')
      .setColor('#264653')
      .setTimestamp()
      .addFields(
        { name: 'Subscribed Users', value: String(stats.subscribedUsersCount), inline: true },
        { name: 'Total Verses Sent', value: String(stats.totalVersesSent), inline: true },
        {
          name: 'Total Commands Executed',
          value: String(stats.totalCommandsExecuted),
          inline: true,
        },
        { name: 'Total Active Guilds', value: String(stats.activeGuilds), inline: true },
        { name: 'Uptime', value: `${days}d ${hours}h ${minutes}m ${seconds}s`, inline: true },
        { name: 'Bot Version', value: version, inline: true }
      )
      .setThumbnail(interaction.client.user.displayAvatarURL());

    await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
  },
};
