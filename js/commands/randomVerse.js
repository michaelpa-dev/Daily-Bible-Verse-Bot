const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sendDailyVerse = require('../verseSender');
const { logger } = require('../logger.js');
const { addCommandExecution } = require('../db/statsDB.js');
const { getUserPreferences } = require('../db/subscribeDB.js');
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
    .setName('randomverse')
    .setDescription('Get a random Bible verse via DM')
    .addStringOption((option) => {
      option
        .setName('translation')
        .setDescription('Optional translation override for this request');
      for (const choice of translationChoices) {
        option.addChoices(choice);
      }
      return option;
    }),
  async execute(interaction) {
    await addCommandExecution();
    logger.info(`Slash command /randomverse called by ${interaction.user.username}`);

    try {
      const requestedTranslation = interaction.options.getString('translation');
      const preferences = await getUserPreferences(interaction.user.id);
      const selectedTranslation = normalizeTranslationCode(
        requestedTranslation || preferences?.translation || DEFAULT_TRANSLATION
      );
      const translationLabel = getTranslationLabel(selectedTranslation);

      const embed = new EmbedBuilder()
        .setTitle('A random Bible verse has been sent to your DMs')
        .setColor('#0099FF')
        .setTimestamp()
        .setDescription(`Translation: ${translationLabel}.`)
        .setFooter({
          text: 'Use /settranslation to change your saved preference.',
        })
        .setThumbnail(interaction.client.user.displayAvatarURL());
      await interaction.reply({ embeds: [embed], ephemeral: true });

      const didSend = await sendDailyVerse(interaction.client, interaction.user.id, 'random', {
        translation: selectedTranslation,
      });

      if (!didSend) {
        await interaction.followUp({
          content: 'I could not send a verse to your DMs. Please check your DM privacy settings.',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error(error);
      await logCommandError(interaction, error, 'Random verse command failed');
      const message = 'An error occurred while sending the random Bible verse.';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  },
};
