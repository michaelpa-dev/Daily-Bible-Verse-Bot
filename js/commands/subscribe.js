const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { logger } = require('../logger.js');
const sendDailyVerse = require('../verseSender');
const { addSubscribedUser, isSubscribed, setUserTranslation } = require('../db/subscribeDB.js');
const { addCommandExecution, updateSubscribedUsersCount } = require('../db/statsDB.js');
const {
  DEFAULT_TRANSLATION,
  getTranslationLabel,
  normalizeTranslationCode,
  toDiscordChoices,
} = require('../constants/translations.js');
const { logCommandError } = require('../services/botOps.js');

const translationChoices = toDiscordChoices().slice(0, 25);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('subscribe')
    .setDescription('Subscribe to daily Bible verses')
    .addStringOption((option) => {
      option.setName('translation').setDescription('Set your preferred Bible translation');
      for (const choice of translationChoices) {
        option.addChoices(choice);
      }
      return option;
    }),
  async execute(interaction) {
    await addCommandExecution();
    logger.info(`Slash command /subscribe called by ${interaction.user.username}`);

    const userID = interaction.user.id;
    const translationInput = interaction.options.getString('translation');
    const selectedTranslation = normalizeTranslationCode(translationInput || DEFAULT_TRANSLATION);
    const selectedTranslationLabel = getTranslationLabel(selectedTranslation);

    try {
      if (await isSubscribed(userID)) {
        if (translationInput) {
          await setUserTranslation(userID, selectedTranslation);
        }

        const embed = new EmbedBuilder()
          .setTitle('You are already subscribed')
          .setColor('#FF0000')
          .setTimestamp()
          .setDescription(
            `You are already subscribed to daily Bible verses.\nCurrent translation: ${selectedTranslationLabel}.`
          )
          .setFooter({
            text: 'Use /settranslation to update your translation preference any time.',
          })
          .setThumbnail(interaction.client.user.displayAvatarURL());

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      await addSubscribedUser(userID, selectedTranslation);
      await updateSubscribedUsersCount();

      const embed = new EmbedBuilder()
        .setTitle('You have been subscribed')
        .setColor('#00AA55')
        .setTimestamp()
        .setDescription(
          `You will now receive daily Bible verses.\nTranslation: ${selectedTranslationLabel}.`
        )
        .setFooter({
          text: 'You can unsubscribe at any time with /unsubscribe.',
        })
        .setThumbnail(interaction.client.user.displayAvatarURL());

      await interaction.reply({ embeds: [embed], ephemeral: true });

      await sendDailyVerse(interaction.client, userID, 'votd', {
        translation: selectedTranslation,
      });
    } catch (error) {
      logger.error(error);
      await logCommandError(interaction, error, 'Subscribe command failed');
      const message = 'An error occurred while processing your subscription request.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  },
};
