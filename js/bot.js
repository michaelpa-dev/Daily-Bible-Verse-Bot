// Import required modules
const { Client, Events, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { botToken } = require('../cfg/config.json');
const { logger, scriptDirectory } = require('./logger.js');
const cron = require('node-cron');
const sendDailyVerse = require('./verseSender');
const { getSubscribedUsers } = require('./db/subscribeDB.js');
const { updateActiveGuilds, updateSubscribedUsersCount } = require('./db/statsDB.js');


// Initialize the Discord bot with specified intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // Listen for guild events
    GatewayIntentBits.GuildMessages, // Listen for guild message events
    GatewayIntentBits.MessageContent, // Listen for message content events
    GatewayIntentBits.GuildMembers, // Listen for guild member events
    GatewayIntentBits.GuildMessageReactions, // Listen for guild message reaction events
    GatewayIntentBits.DirectMessages, // Listen for direct message events
    GatewayIntentBits.DirectMessageReactions, // Listen for direct message reaction events
  ],
});


// Run once when the client is ready
client.once(Events.ClientReady, async () => {
  logger.info(`Logged in as ${client.user.username}`);

  try {
    const avatar = await promisify(fs.readFile)(
      path.join(scriptDirectory, '../assets/bible_scripture_icon.png')
    );
    await client.user.setAvatar(avatar);
  } catch (error) {
    logger.warn(`Failed to set bot avatar: ${error}`);
  } finally {
    logger.debug('Bot Avatar set');
  }

  await updateActiveGuilds(client);
  await updateSubscribedUsersCount();

  //Register commands on client startup
  for (const guild of client.guilds.cache.values()) {
    await registerSlashCommands(guild);
  }
});


// Function to register slash commands in a guild
// This function is called when the client is ready and when the client joins a guild
async function registerSlashCommands(guild) {
  const commands = fs
    .readdirSync(path.join(scriptDirectory, 'commands'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => {
      const filePath = path.join(scriptDirectory, 'commands', file);
      if (fs.existsSync(filePath)) {
        const command = require(filePath);
        return command.data.toJSON();
      } else {
        logger.warn(`Command file not found: ${filePath}`);
        return null;
      }
    })
    .filter(Boolean);

  try {
    await guild.commands.set(commands);
    logger.info(`Slash commands registered in guild (ID/Name: ${guild.id}/${guild.name}, Owner: ${guild.ownerId})`);
  } catch (error) {
    logger.error(`Failed to register slash commands: ${error}`);
  }
}

// Event handler for when the client joins a guild
client.on(Events.GuildCreate, async (guild) => {
  logger.info(
    `Joined guild (ID: ${guild.id}, Name: ${guild.name}, Owner: ${guild.ownerId})`
  );
  await registerSlashCommands(guild);
  await updateActiveGuilds(client);
});

// Event handler for slash commands
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;
    const commandName = interaction.commandName;
    const commandId = interaction.commandId;
    logger.info(`Slash command received: ${commandName} (ID: ${commandId}, Guild/Name: ${interaction.guildId}/${interaction.guild.name}, User/Name: ${interaction.user.id}/${interaction.user.username}, Channel/Name: ${interaction.channelId}/${interaction.channel.name})`);
    const command = interaction.guild.commands.fetch(commandId);

    if (!command) return;
    try {
        // Execute the command located in the commands folder with the same name as the slash command
        await require(path.join(scriptDirectory, 'commands', `${commandName}.js`)).execute(interaction);

    } catch (error) {
        logger.error(error.stack);
        await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
    }
});

// Function to run the client and tasks
async function runBot() {
  await client.login(botToken);

  // Read the statuses from the statuses.txt file
  const statuses = fs.readFileSync(path.join(scriptDirectory, '../assets/statuses.txt'), 'utf8').split('\n');
  await setStatus(statuses);

  // Set the bot status every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await setStatus(statuses);
  });

  // Schedule the task to run at 0900 EST and repeat daily
  runTaskAtSpecificTime(sendDailyVerseToSubscribedUsers, 9, 0);
}

async function sendDailyVerseToSubscribedUsers() {
  try {
    const subscribedUsers = await getSubscribedUsers();
    logger.info('Sending daily verse to ' + subscribedUsers.length + ' users');
    for (const user of subscribedUsers) {
      logger.debug('Sending daily verse to ' + user.id);
      await sendDailyVerse(client, user.id, 'votd');
    }
  } catch (error) {
    logger.error(error.stack);
  }
}

function runTaskAtSpecificTime(task, targetHour, targetMinute) {
  const now = new Date();
  const targetTime = new Date();
  
  targetTime.setHours(targetHour);
  targetTime.setMinutes(targetMinute);
  targetTime.setSeconds(0);

  const timeDifference = targetTime - now;

  if (timeDifference > 0) {
    logger.info(`Scheduled to send daily verse to subscribers in (hh:mm:ss): ${msToTime(timeDifference)}`);
    setTimeout(async () => {
      logger.debug(`Running daily verse task at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
      await task();
      logger.debug(`Daily verse task completed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
      runTaskAtSpecificTime(task, targetHour, targetMinute); // Schedule the task for the next day
    }, timeDifference);
  } else {
    targetTime.setDate(targetTime.getDate() + 1);
    const nextDayTimeDifference = targetTime - now;
    logger.info(`Scheduled to send daily verse to subscribers in (hh:mm:ss): ${msToTime(nextDayTimeDifference)}`);
    setTimeout(async () => {
      logger.debug(`Running daily verse task at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
      await task();
      logger.debug(`Daily verse task completed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
      runTaskAtSpecificTime(task, targetHour, targetMinute); // Schedule the task for the next day
    }, nextDayTimeDifference);
  }
}

//function to convert ms to hh:mm:ss
function msToTime(duration) {
  var milliseconds = parseInt((duration % 1000) / 100),
      seconds = parseInt((duration / 1000) % 60),
      minutes = parseInt((duration / (1000 * 60)) % 60),
      hours = parseInt((duration / (1000 * 60 * 60)) % 24);

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

//Function to set the bot status
async function setStatus(statuses) {
  const status = statuses.shift();
  statuses.push(status);
  logger.debug(`Setting status to: ${status}`);
  client.user.setActivity(status, { type: ActivityType.Listening});
}

// Run the bot using promisify to handle promises
promisify(runBot)();
