const { logger } = require('../logger.js');
const { logCommandError } = require('./botOps.js');

async function safeInteractionReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
    return true;
  } catch (error) {
    // Never let a reply failure crash the bot. Common causes include:
    // - "Unknown interaction" (timed out)
    // - missing permissions in a channel
    logger.warn(`Failed to reply to interaction safely: ${error?.message || error}`);
    return false;
  }
}

async function runCommandSafely(interaction, command, options = {}) {
  const log = options.logger || logger;
  const logCommandErrorFn =
    typeof options.logCommandErrorFn === 'function' ? options.logCommandErrorFn : logCommandError;
  const friendlyMessage =
    typeof options.friendlyMessage === 'string' && options.friendlyMessage.trim().length > 0
      ? options.friendlyMessage.trim()
      : 'An error occurred while executing this command.';

  const startedAt = Date.now();

  try {
    await command.execute(interaction);
    return { ok: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    const commandName = interaction?.commandName ? `/${interaction.commandName}` : 'unknown';
    log.error(`Unhandled error in command ${commandName}`, error);

    try {
      await logCommandErrorFn(interaction, error, 'Unhandled command execution error');
    } catch (logError) {
      log.warn(`Failed to log command error to #bot-logs: ${logError?.message || logError}`);
    }

    await safeInteractionReply(interaction, { content: friendlyMessage, ephemeral: true });

    return { ok: false, durationMs: Date.now() - startedAt, error };
  }
}

module.exports = {
  runCommandSafely,
  safeInteractionReply,
};

