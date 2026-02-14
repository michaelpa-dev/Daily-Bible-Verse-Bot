const { EmbedBuilder } = require('discord.js');
const { logger } = require('./logger.js');
const { getRandomBibleVerse } = require('./services/bibleApi');
const { addVerseSent } = require('./db/statsDB.js');
const { getTranslationLabel } = require('./constants/translations.js');

async function sendDailyVerse(client, userOrId, passage, options = {}) {
  const resolvedUserId = typeof userOrId === 'string' ? userOrId : userOrId?.id;

  if (!resolvedUserId) {
    logger.warn('Cannot send verse because no user ID was provided.');
    return false;
  }

  logger.debug(`Sending ${passage} verse to user: ${resolvedUserId}`);

  const user = await client.users.fetch(resolvedUserId);
  if (!user) {
    return false;
  }

  const translation = options.translation;
  const randomVerse = await getRandomBibleVerse(passage, { translation });

  if (!randomVerse) {
    return false;
  }

  const verseText = randomVerse.text;
  const verseReference =
    randomVerse.reference || `${randomVerse.bookname} ${randomVerse.chapter}:${randomVerse.verse}`;
  const translationLabel = randomVerse.translationName || getTranslationLabel(translation);
  logger.debug(
    `Sending verse to ${user.username} (${user.id}) ${verseReference} [${translationLabel}]`
  );

  const embed = new EmbedBuilder()
    .setTitle('Daily Bible Verse')
    .setDescription(verseText)
    .setColor('#0099ff')
    .addFields(
      { name: 'Reference', value: verseReference },
      { name: 'Translation', value: translationLabel }
    )
    .setFooter({ text: 'Sent by Daily Bible Verse Bot' })
    .setThumbnail(client.user.displayAvatarURL());

  try {
    await user.send({ embeds: [embed] });
    logger.debug(
      `Verse sent successfully. User: ${user.username} (${user.id}), Verse: ${verseReference}`
    );
    await addVerseSent();
    return true;
  } catch (error) {
    logger.error(`Error sending verse for user ${user.username} (${user.id})`, error);
    return false;
  }
}

// Export the sendDailyVerse function
module.exports = sendDailyVerse;
