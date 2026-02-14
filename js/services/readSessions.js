const crypto = require('node:crypto');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const { BOOKS, getBookById } = require('../constants/books.js');
const { getGroupById, getGroupIdForBook, listGroups, listBooksInCanonOrder } = require('../constants/bookGroups.js');
const { getBookChapterCount } = require('../constants/webVerseCounts.js');
const { logger } = require('../logger.js');
const { fetchPassageForBookChapter } = require('./bibleApiWeb.js');
const { parseScriptureReference } = require('./scriptureReference.js');
const { paginateLines } = require('./pagination.js');
const { buildEmbedTitle, formatPassageLines } = require('./passageFormatter.js');

const CUSTOM_ID_PREFIX = 'rd';
const DEFAULT_TTL_MS = 25 * 60 * 1000;

const sessions = new Map();

function createSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

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
  return { sessionId: parts[1], action: parts[2] };
}

function getSession(id) {
  const sessionId = String(id || '').trim();
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function deleteSession(id) {
  const sessionId = String(id || '').trim();
  if (!sessionId) {
    return false;
  }
  return sessions.delete(sessionId);
}

function computeNextBookId(currentBookId, direction) {
  const ids = BOOKS.map((book) => book.id);
  const currentIndex = ids.indexOf(String(currentBookId || '').toUpperCase());
  if (currentIndex < 0) {
    return null;
  }

  const nextIndex = currentIndex + (direction === 'prev' ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= ids.length) {
    return null;
  }

  return ids[nextIndex];
}

async function loadPassagePages(session, options = {}) {
  const bookId = String(options.bookId || session.bookId).toUpperCase();
  const chapter = Number(options.chapter || session.chapter);
  const verseSpec = options.verseSpec ?? session.verseSpec;

  const cacheKey = `${bookId}:${chapter}:${verseSpec || ''}`;
  if (session.cache.has(cacheKey)) {
    const cached = session.cache.get(cacheKey);
    session.passage = cached.passage;
    session.pages = cached.pages;
    session.pageIndex = 0;
    session.bookId = bookId;
    session.chapter = chapter;
    session.verseSpec = verseSpec || null;
    session.groupId = getGroupIdForBook(bookId) || session.groupId;
    return;
  }

  const passage = await fetchPassageForBookChapter(bookId, chapter, verseSpec, {
    translation: 'web',
    fetchImpl: session.fetchImpl,
  });

  const lines = formatPassageLines(passage);
  const pages = paginateLines(lines, { maxChars: 3400 });

  session.cache.set(cacheKey, { passage, pages });
  session.passage = passage;
  session.pages = pages;
  session.pageIndex = 0;
  session.bookId = bookId;
  session.chapter = chapter;
  session.verseSpec = verseSpec || null;
  session.groupId = getGroupIdForBook(bookId) || session.groupId;
}

function buildEmbed(session) {
  const passage = session.passage;
  const translationId = passage?.translationId || 'web';
  const book = getBookById(session.bookId);
  const reference = book
    ? `${book.name} ${session.chapter}${session.verseSpec ? `:${session.verseSpec}` : ''}`
    : `${session.bookId} ${session.chapter}${session.verseSpec ? `:${session.verseSpec}` : ''}`;

  const title = buildEmbedTitle(reference, translationId);
  const total = session.pages.length;
  const pageIndex = Math.min(Math.max(session.pageIndex, 0), total - 1);

  const translationName = String(passage?.translationName || 'World English Bible').trim();
  const note = String(passage?.translationNote || '').trim();
  const footerBase = `${translationName}${note ? ` • ${note}` : ''} • Source: bible-api.com`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(session.pages[pageIndex])
    .setColor('#0099ff')
    .setFooter({
      text: `${footerBase} • Page ${pageIndex + 1}/${total}`,
    })
    .setTimestamp(new Date());

  return embed;
}

function buildGroupSelect(session) {
  const groups = listGroups();
  const options = groups.map((group) => ({
    label: group.label,
    value: group.id,
    default: group.id === session.groupId,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(session.id, 'group'))
    .setPlaceholder('Change book group')
    .addOptions(options.slice(0, 25));

  return new ActionRowBuilder().addComponents(menu);
}

function buildBookSelect(session) {
  const group = getGroupById(session.groupId);
  const bookIds = group ? listBooksInCanonOrder(group.bookIds) : [];

  const options = bookIds.map((bookId) => {
    const book = getBookById(bookId);
    return {
      label: book ? book.name : bookId,
      value: bookId,
      default: bookId === session.bookId,
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(session.id, 'book'))
    .setPlaceholder('Change book')
    .addOptions(options.slice(0, 25));

  return new ActionRowBuilder().addComponents(menu);
}

function buildComponents(session) {
  const total = session.pages.length;
  const pageIndex = Math.min(Math.max(session.pageIndex, 0), total - 1);

  const maxChapters = getBookChapterCount(session.bookId);
  const canPrevChapter = session.chapter > 1 || Boolean(computeNextBookId(session.bookId, 'prev'));
  const canNextChapter = session.chapter < maxChapters || Boolean(computeNextBookId(session.bookId, 'next'));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'prevPage'))
      .setLabel('⬅ Prev Page')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'nextPage'))
      .setLabel('Next Page ➡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= total - 1),
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'close'))
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'prevChapter'))
      .setLabel('⏮ Prev Chapter')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canPrevChapter),
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'nextChapter'))
      .setLabel('Next Chapter ⏭')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!canNextChapter),
    new ButtonBuilder()
      .setCustomId(buildCustomId(session.id, 'jump'))
      .setLabel('Jump')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, buildGroupSelect(session), buildBookSelect(session)];
}

function buildJumpModal(session) {
  const modal = new ModalBuilder()
    .setCustomId(buildCustomId(session.id, 'jumpSubmit'))
    .setTitle('Jump To Reference');

  const input = new TextInputBuilder()
    .setCustomId('reference')
    .setLabel('Reference (example: John 3, Matt 25:31-33,46)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);

  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);
  return modal;
}

async function createReadSession(options) {
  const userId = String(options?.userId || '').trim();
  if (!userId) {
    throw new Error('Read session requires userId.');
  }

  const parsed = parseScriptureReference(options.reference);

  const session = {
    id: createSessionId(),
    userId,
    kind: 'read',
    fetchImpl: options.fetchImpl,
    bookId: parsed.bookId,
    chapter: parsed.chapter,
    verseSpec: parsed.verseSpec,
    groupId: getGroupIdForBook(parsed.bookId) || 'nt_gospels',
    pages: [],
    pageIndex: 0,
    cache: new Map(),
    passage: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  };

  sessions.set(session.id, session);
  await loadPassagePages(session, {
    bookId: parsed.bookId,
    chapter: parsed.chapter,
    verseSpec: parsed.verseSpec,
  });

  return session;
}

function buildReadMessage(session) {
  return {
    embeds: [buildEmbed(session)],
    components: buildComponents(session),
  };
}

async function handleReadInteraction(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return false;
  }

  const session = getSession(parsed.sessionId);
  if (!session) {
    await interaction.reply({
      content: 'This reading session has expired. Re-run `/read` to start a new one.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'This reading control belongs to a different user.',
      ephemeral: true,
    });
    return true;
  }

  if (interaction.isButton()) {
    if (parsed.action === 'close') {
      deleteSession(session.id);
      await interaction.update({ embeds: [buildEmbed(session)], components: [] });
      return true;
    }

    if (parsed.action === 'prevPage') {
      session.pageIndex = Math.max(0, session.pageIndex - 1);
      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (parsed.action === 'nextPage') {
      session.pageIndex = Math.min(session.pages.length - 1, session.pageIndex + 1);
      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (parsed.action === 'prevChapter' || parsed.action === 'nextChapter') {
      const direction = parsed.action === 'prevChapter' ? 'prev' : 'next';
      const maxChapters = getBookChapterCount(session.bookId);

      let nextBookId = session.bookId;
      let nextChapter = session.chapter + (direction === 'prev' ? -1 : 1);

      if (nextChapter < 1) {
        const previousBook = computeNextBookId(session.bookId, 'prev');
        if (previousBook) {
          nextBookId = previousBook;
          nextChapter = getBookChapterCount(nextBookId) || 1;
        } else {
          nextChapter = 1;
        }
      } else if (nextChapter > maxChapters) {
        const followingBook = computeNextBookId(session.bookId, 'next');
        if (followingBook) {
          nextBookId = followingBook;
          nextChapter = 1;
        } else {
          nextChapter = maxChapters;
        }
      }

      // Chapter navigation always switches to full chapter reading.
      await loadPassagePages(session, { bookId: nextBookId, chapter: nextChapter, verseSpec: null });
      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (parsed.action === 'jump') {
      await interaction.showModal(buildJumpModal(session));
      return true;
    }

    await interaction.reply({ content: 'Unknown action.', ephemeral: true });
    return true;
  }

  if (interaction.isStringSelectMenu()) {
    if (parsed.action === 'group') {
      const groupId = interaction.values?.[0];
      const group = getGroupById(groupId);
      if (!group) {
        await interaction.reply({ content: 'Unknown group selection.', ephemeral: true });
        return true;
      }

      session.groupId = group.id;
      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (parsed.action === 'book') {
      const bookId = String(interaction.values?.[0] || '').toUpperCase();
      const book = getBookById(bookId);
      if (!book) {
        await interaction.reply({ content: 'Unknown book selection.', ephemeral: true });
        return true;
      }

      const chapterCount = getBookChapterCount(bookId);
      const nextChapter = chapterCount > 0 ? Math.min(session.chapter, chapterCount) : 1;

      await loadPassagePages(session, { bookId, chapter: nextChapter, verseSpec: null });
      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

    await interaction.reply({ content: 'Unknown selection.', ephemeral: true });
    return true;
  }

  if (interaction.isModalSubmit()) {
    if (parsed.action !== 'jumpSubmit') {
      await interaction.reply({ content: 'Unknown modal submit.', ephemeral: true });
      return true;
    }

    const reference = interaction.fields.getTextInputValue('reference');
    try {
      const parsedRef = parseScriptureReference(reference);
      await loadPassagePages(session, {
        bookId: parsedRef.bookId,
        chapter: parsedRef.chapter,
        verseSpec: parsedRef.verseSpec,
      });
    } catch (error) {
      await interaction.reply({
        content: error instanceof Error ? error.message : 'Invalid reference.',
        ephemeral: true,
      });
      return true;
    }

    await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
    return true;
  }

  logger.warn(`Unhandled read session interaction type for ${interaction.customId}`);
  return false;
}

module.exports = {
  buildReadMessage,
  createReadSession,
  handleReadInteraction,
  __private: {
    buildCustomId,
    buildComponents,
    buildEmbed,
    buildJumpModal,
    getSession,
    parseCustomId,
  },
};
