const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { logger } = require('../logger.js');
const { removeSubscribedUser, isSubscribed } = require('../db/subscribeDB.js');
const { addCommandExecution, updateSubscribedUsersCount } = require('../db/statsDB.js');
const { logCommandError } = require('../services/botOps.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unsubscribe')
    .setDescription('Unsubscribe from daily Bible verses'),
  async execute(interaction) {
    await addCommandExecution();
    logger.info(`Slash command /unsubscribe called by ${interaction.user.username}`);

    const userID = interaction.user.id;

    try {
      if (await isSubscribed(userID)) {
        await removeSubscribedUser(userID);
        await updateSubscribedUsersCount();

        const embed = new EmbedBuilder()
          .setTitle('You have been unsubscribed')
          .setColor('#FF0000')
          .setTimestamp()
          .setDescription('You will no longer receive daily Bible verses.')
          .setFooter({
            text: 'You can subscribe again any time using /subscribe.',
          })
          .setThumbnail(interaction.client.user.displayAvatarURL());

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('You are not subscribed')
        .setColor('#FF0000')
        .setTimestamp()
        .setDescription('You are not currently subscribed to daily Bible verses.')
        .setFooter({ text: 'Use /subscribe to start daily verses.' })
        .setThumbnail(interaction.client.user.displayAvatarURL());

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      logger.error(error);
      await logCommandError(interaction, error, 'Unsubscribe command failed');
      const message =
        'An error occurred while processing your unsubscription request.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  },
};
