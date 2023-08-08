const { EmbedBuilder } = require('discord.js');
const { logger } = require('./logger.js');
const { getRandomBibleVerse } = require('./services/bibleApi');
const { addVerseSent } = require('./db/statsDB.js');

async function sendDailyVerse(client, userId, passage) {
  logger.debug('Sending daily verse to User: ' + userId);
  const user = await client.users.fetch(userId);
  if (!user) return;

  const randomVerse = await getRandomBibleVerse(passage);

  if (!randomVerse) return;

  const verseText = randomVerse.text;
  const verseReference = `${randomVerse.bookname} ${randomVerse.chapter}:${randomVerse.verse}`;
  logger.debug('Sending daily verse to User: ' + user.username + ' (' + user.id + ') Verse: ' + verseText + ' ' + verseReference);
  const embed = new EmbedBuilder()
    .setTitle('Daily Bible Verse')
    .setDescription(verseText)
    .setColor('#0099ff')
    .addFields(
      { name: 'Reference', value: verseReference },
    )
    .setFooter({text: 'Sent by Your Daily Verse Bot from server ' })
    .setThumbnail(client.user.displayAvatarURL());

  try {
    await user.send({ embeds: [embed] });
    logger.debug('Daily verse sent successfully. User: ' + user.username + ' (' + user.id + ') Verse: ' + verseReference);
     await addVerseSent();
  } catch (error) {
    logger.error('Error sending daily verse for User:' + user.username + ' (' + user.id + ')', error);
  }
}

// Export the sendDailyVerse function
module.exports = sendDailyVerse;
