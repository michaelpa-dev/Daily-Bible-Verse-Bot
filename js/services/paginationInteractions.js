const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const {
  createPaginationSession,
  deletePaginationSession,
  getPaginationSession,
} = require('./paginationSessions.js');

const CUSTOM_ID_PREFIX = 'pg';

function buildCustomId(sessionId, action) {
  return `${CUSTOM_ID_PREFIX}|${sessionId}|${action}`;
}

function parseCustomId(customId) {
  const raw = String(customId || '');
  const parts = raw.split('|');
  if (parts.length !== 3) {
    return null;
  }
  if (parts[0] !== CUSTOM_ID_PREFIX) {
    return null;
  }
  return {
    sessionId: parts[1],
    action: parts[2],
  };
}

function buildPaginationEmbed(session) {
  const total = session.pages.length;
  const pageIndex = Math.min(Math.max(session.pageIndex, 0), total - 1);
  const page = session.pages[pageIndex];

  const embed = new EmbedBuilder().setDescription(page).setFooter({
    text: session.footer
      ? `${session.footer} • Page ${pageIndex + 1}/${total}`
      : `Page ${pageIndex + 1}/${total}`,
  });

  if (session.title) {
    embed.setTitle(session.title);
  }
  if (session.color != null) {
    embed.setColor(session.color);
  }

  return embed;
}

function buildPaginationComponents(session) {
  const total = session.pages.length;
  const pageIndex = Math.min(Math.max(session.pageIndex, 0), total - 1);

  const extras = Array.isArray(session.extraComponents) ? session.extraComponents : [];

  if (total <= 1) {
    // Single page: no need for Prev/Next, but keep Close + any extra components (e.g., plan completion buttons).
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(buildCustomId(session.id, 'close'))
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
    );
    return [row, ...extras];
  }

  const prevDisabled = pageIndex <= 0;
  const nextDisabled = pageIndex >= total - 1;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'prev'))
      .setLabel('Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(prevDisabled),
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'next'))
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(nextDisabled),
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'close'))
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
  );

  return [row, ...extras];
}

function createPaginatedMessage(options) {
  const session = createPaginationSession(options);

  return {
    session,
    embed: buildPaginationEmbed(session),
    components: buildPaginationComponents(session),
  };
}

async function handlePaginationInteraction(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return false;
  }

  const session = getPaginationSession(parsed.sessionId);
  if (!session) {
    await interaction.reply({
      content: 'This pagination session has expired. Re-run the command to regenerate it.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'This pagination control belongs to a different user.',
      ephemeral: true,
    });
    return true;
  }

  if (parsed.action === 'close') {
    deletePaginationSession(session.id);
    await interaction.update({
      embeds: [buildPaginationEmbed(session)],
      components: [],
    });
    return true;
  }

  if (parsed.action === 'prev') {
    session.pageIndex = Math.max(0, session.pageIndex - 1);
  } else if (parsed.action === 'next') {
    session.pageIndex = Math.min(session.pages.length - 1, session.pageIndex + 1);
  } else {
    await interaction.reply({ content: 'Unknown pagination action.', ephemeral: true });
    return true;
  }

  await interaction.update({
    embeds: [buildPaginationEmbed(session)],
    components: buildPaginationComponents(session),
  });

  return true;
}

module.exports = {
  createPaginatedMessage,
  handlePaginationInteraction,
  __private: {
    buildCustomId,
    buildPaginationComponents,
    buildPaginationEmbed,
    parseCustomId,
  },
};
