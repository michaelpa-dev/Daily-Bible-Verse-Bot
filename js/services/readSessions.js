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
const devBotLogs = require('./devBotLogs.js');
const {
  parseScriptureReferenceDetailed,
  parseVerseSpec,
} = require('./scriptureReference.js');
const { paginateLines } = require('./pagination.js');
const { buildEmbedTitle, formatPassageLines } = require('./passageFormatter.js');
const { buildScriptureFooter, buildStandardEmbed, COLORS } = require('./messageStyle.js');

const CUSTOM_ID_PREFIX = 'rd';
const DEFAULT_TTL_MS = 25 * 60 * 1000;
const MAX_SESSIONS = 250;
const RESOLUTION_CANCEL_VALUE = '__cancel__';

const sessions = new Map();

function createSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

function sweepExpiredSessions(now = Date.now()) {
  for (const [id, session] of sessions.entries()) {
    if (!session || typeof session.expiresAt !== 'number' || now > session.expiresAt) {
      sessions.delete(id);
    }
  }
}

function pruneToMaxSessions() {
  if (sessions.size <= MAX_SESSIONS) {
    return;
  }

  // Map preserves insertion order; delete oldest sessions first.
  const overflow = sessions.size - MAX_SESSIONS;
  let removed = 0;
  for (const id of sessions.keys()) {
    sessions.delete(id);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
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
  // DM "page-turner" mode: keep pages smaller for readability and faster scrolling.
  // This intentionally roughly halves the previous size to double page count.
  const pages = paginateLines(lines, { maxChars: 1700 });

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
    ? `${book.name} (${book.id}) ${session.chapter}${session.verseSpec ? `:${session.verseSpec}` : ''}`
    : `${session.bookId} ${session.chapter}${session.verseSpec ? `:${session.verseSpec}` : ''}`;

  const title = buildEmbedTitle(reference, translationId);
  const total = session.pages.length;
  const pageIndex = Math.min(Math.max(session.pageIndex, 0), total - 1);

  const footerBase = buildScriptureFooter(passage);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(session.pages[pageIndex])
    .setColor(COLORS.primary)
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

function formatPendingReference(pending) {
  if (!pending) {
    return '';
  }

  const bookPart = String(pending.bookPart || '').trim();
  const chapter = Number(pending.chapter || 0);
  const verseSpec = pending.verseSpec ? String(pending.verseSpec).trim() : '';

  if (!bookPart || !Number.isFinite(chapter) || chapter <= 0) {
    return '';
  }

  return verseSpec ? `${bookPart} ${chapter}:${verseSpec}` : `${bookPart} ${chapter}`;
}

function buildBookResolutionSelect(session, action, candidates = [], options = {}) {
  const menuOptions = [];

  const seen = new Set();
  for (const candidate of candidates) {
    const bookId = String(candidate || '').toUpperCase();
    if (!bookId || seen.has(bookId)) {
      continue;
    }
    seen.add(bookId);

    const book = getBookById(bookId);
    if (!book) {
      continue;
    }

    menuOptions.push({
      label: book.name,
      description: book.id,
      value: book.id,
      default: menuOptions.length === 0,
    });
  }

  menuOptions.push({
    label: 'Cancel',
    description: String(options.cancelDescription || 'Cancel').slice(0, 100),
    value: RESOLUTION_CANCEL_VALUE,
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(session.id, action))
    .setPlaceholder('Select a book to continue')
    .addOptions(menuOptions.slice(0, 25));

  return new ActionRowBuilder().addComponents(menu);
}

function buildResolutionPromptEmbed({ title, descriptionLines }) {
  return buildStandardEmbed({
    title,
    description: (descriptionLines || []).filter(Boolean).join('\n'),
    color: COLORS.warning,
    footerText: 'Tip: add an ordinal like "1" or "2" to disambiguate.',
  });
}

function buildReadResolutionMessage(session) {
  const pending = session.pendingStart;
  if (!pending) {
    return {
      embeds: [
        buildResolutionPromptEmbed({
          title: 'Reference needs clarification',
          descriptionLines: ['This reader session is missing its pending reference context.'],
        }),
      ],
      components: [],
    };
  }

  const bestGuess = pending.candidateBookIds?.[0];
  const bestBook = bestGuess ? getBookById(bestGuess) : null;

  const descriptionLines = [
    `I couldn't confidently resolve the book in: \`${formatPendingReference(pending) || pending.originalReference}\``,
    bestBook ? `Best guess: **${bestBook.name} (${bestBook.id})**` : null,
    '',
    'Select the correct book below to start your reader session.',
  ];

  const embed = buildResolutionPromptEmbed({
    title: 'Confirm Book',
    descriptionLines,
  });

  const row = buildBookResolutionSelect(session, 'resolveStart', pending.candidateBookIds || [], {
    cancelDescription: 'Do not start a session',
  });
  return { embeds: [embed], components: [row] };
}

function buildJumpResolutionEmbed(session) {
  const pending = session.pendingJump;
  if (!pending) {
    return buildResolutionPromptEmbed({
      title: 'Jump needs clarification',
      descriptionLines: ['This reader session is missing its pending jump context.'],
    });
  }

  const bestGuess = pending.candidateBookIds?.[0];
  const bestBook = bestGuess ? getBookById(bestGuess) : null;

  const descriptionLines = [
    `I couldn't confidently resolve the book in: \`${formatPendingReference(pending) || pending.originalReference}\``,
    bestBook ? `Best guess: **${bestBook.name} (${bestBook.id})**` : null,
    '',
    'Select the correct book below to jump.',
  ];

  return buildResolutionPromptEmbed({
    title: 'Confirm Jump Book',
    descriptionLines,
  });
}

function buildComponentsWithJumpResolution(session) {
  const base = buildComponents(session);
  if (!session.pendingJump) {
    return base;
  }

  const row = buildBookResolutionSelect(session, 'resolveJump', session.pendingJump.candidateBookIds || [], {
    cancelDescription: 'Keep current passage',
  });

  const withRow = base.concat(row);
  return withRow.slice(0, 5);
}

async function createReadSession(options) {
  sweepExpiredSessions();
  pruneToMaxSessions();

  const userId = String(options?.userId || '').trim();
  if (!userId) {
    throw new Error('Read session requires userId.');
  }

  const reference = String(options.reference || '').trim();
  const detailed = parseScriptureReferenceDetailed(reference, { maxCandidates: 5 });

  if (detailed.kind === 'ok') {
    const parsed = detailed.parsed;
    const session = {
      id: createSessionId(),
      userId,
      kind: 'read',
      status: 'active',
      fetchImpl: options.fetchImpl,
      bookId: parsed.bookId,
      chapter: parsed.chapter,
      verseSpec: parsed.verseSpec,
      groupId: getGroupIdForBook(parsed.bookId) || 'nt_gospels',
      pages: [],
      pageIndex: 0,
      cache: new Map(),
      passage: null,
      pendingStart: null,
      pendingJump: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + DEFAULT_TTL_MS,
    };

    sessions.set(session.id, session);
    await loadPassagePages(session, {
      bookId: parsed.bookId,
      chapter: parsed.chapter,
      verseSpec: parsed.verseSpec,
    });

    devBotLogs.logEvent('info', 'read.session.start', {
      sessionId: session.id,
      userId,
      resolvedBookId: parsed.bookId,
      chapter: parsed.chapter,
      verseSpec: parsed.verseSpec || null,
      input: reference,
    });

    return { kind: 'ready', session };
  }

  if (detailed.kind === 'needs_confirmation') {
    let verseSpec = null;
    try {
      const parsedVerse = detailed.verseSpecRaw ? parseVerseSpec(detailed.verseSpecRaw) : null;
      verseSpec = parsedVerse?.verseSpec || null;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Invalid verse specification.');
    }

    const candidateBookIds = (detailed.resolver?.candidates || [])
      .map((candidate) => String(candidate?.bookId || '').toUpperCase())
      .filter(Boolean)
      .slice(0, 5);

    const session = {
      id: createSessionId(),
      userId,
      kind: 'read',
      status: 'awaiting_book',
      fetchImpl: options.fetchImpl,
      bookId: null,
      chapter: detailed.chapter,
      verseSpec,
      groupId: 'nt_gospels',
      pages: [],
      pageIndex: 0,
      cache: new Map(),
      passage: null,
      pendingStart: {
        originalReference: reference,
        bookPart: detailed.bookPart,
        normalizedInput: detailed.normalizedInput,
        chapter: detailed.chapter,
        verseSpec,
        candidateBookIds,
      },
      pendingJump: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + DEFAULT_TTL_MS,
    };

    sessions.set(session.id, session);
    devBotLogs.logEvent('info', 'read.session.needs_confirmation', {
      sessionId: session.id,
      userId,
      input: reference,
      bookPart: detailed.bookPart,
      chapter: detailed.chapter,
      verseSpec: verseSpec || null,
      candidates: candidateBookIds,
    });

    return { kind: 'needs_confirmation', session };
  }

  throw new Error(detailed.message || 'Invalid reference.');
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

  // If a jump reference is pending resolution and the user interacts with other
  // controls, treat it as an implicit cancel so the UI doesn't get stuck.
  if (session.pendingJump && parsed.action !== 'resolveJump' && parsed.action !== 'jumpSubmit' && parsed.action !== 'jump') {
    devBotLogs.logEvent('info', 'read.jump.cancelled', {
      sessionId: session.id,
      userId: session.userId,
      action: parsed.action,
    });
    session.pendingJump = null;
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
    if (parsed.action === 'resolveStart') {
      if (session.status !== 'awaiting_book' || !session.pendingStart) {
        await interaction.reply({ content: 'This reader prompt is no longer active.', ephemeral: true });
        return true;
      }

      const selected = String(interaction.values?.[0] || '').toUpperCase();
      if (!selected) {
        await interaction.reply({ content: 'No book selected.', ephemeral: true });
        return true;
      }

      if (selected === RESOLUTION_CANCEL_VALUE) {
        deleteSession(session.id);
        const embed = buildStandardEmbed({
          title: 'Reader Cancelled',
          description: 'No reader session was started.',
          color: COLORS.neutral,
        });
        await interaction.update({ embeds: [embed], components: [] });
        return true;
      }

      const bookId = selected;
      const book = getBookById(bookId);
      if (!book) {
        await interaction.reply({ content: 'Unknown book selection.', ephemeral: true });
        return true;
      }

      const maxChapters = getBookChapterCount(bookId);
      if (maxChapters > 0 && session.pendingStart.chapter > maxChapters) {
        const embed = buildResolutionPromptEmbed({
          title: 'Invalid Chapter',
          descriptionLines: [
            `${book.name} only has ${maxChapters} chapter${maxChapters === 1 ? '' : 's'}.`,
            `You requested chapter ${session.pendingStart.chapter}.`,
            '',
            'Choose a different book or rerun `/read` with a valid chapter.',
          ],
        });
        const row = buildBookResolutionSelect(session, 'resolveStart', session.pendingStart.candidateBookIds || [], {
          cancelDescription: 'Do not start a session',
        });
        await interaction.update({ embeds: [embed], components: [row] });
        return true;
      }

      // Promote the session to an active reader.
      session.status = 'active';
      session.bookId = bookId;
      session.groupId = getGroupIdForBook(bookId) || session.groupId;
      session.pendingStart = null;

      await loadPassagePages(session, {
        bookId,
        chapter: session.chapter,
        verseSpec: session.verseSpec,
      });

      const resolvedDisplay = session.verseSpec
        ? `${book.name} (${book.id}) ${session.chapter}:${session.verseSpec}`
        : `${book.name} (${book.id}) ${session.chapter}`;

      devBotLogs.logEvent('info', 'read.session.confirmed', {
        sessionId: session.id,
        userId: session.userId,
        bookId,
        chapter: session.chapter,
        verseSpec: session.verseSpec || null,
        resolved: resolvedDisplay,
      });

      if (interaction.guildId) {
        try {
          await interaction.user.send(buildReadMessage(session));

          const embed = buildStandardEmbed({
            title: 'Check your DMs',
            description: `Resolved: **${resolvedDisplay}**\n\nI sent you a page-turner reader session.`,
            color: COLORS.primary,
            footerText: 'Use /read again to jump to a new reference.',
          });
          await interaction.update({ embeds: [embed], components: [] });
        } catch (error) {
          logger.warn('Failed to DM reader session; user may have DMs disabled.', error);
          await interaction.update({
            embeds: [
              buildStandardEmbed({
                title: 'Unable to DM You',
                description:
                  'I could not send you a DM. Please check your DM privacy settings and try again.',
                color: COLORS.danger,
              }),
            ],
            components: [],
          });
        }
        return true;
      }

      // DM invocation: update the prompt message into the actual reader message.
      await interaction.update(buildReadMessage(session));
      return true;
    }

    if (parsed.action === 'resolveJump') {
      if (!session.pendingJump) {
        await interaction.reply({ content: 'No pending jump to resolve.', ephemeral: true });
        return true;
      }

      const selected = String(interaction.values?.[0] || '').toUpperCase();
      if (!selected) {
        await interaction.reply({ content: 'No book selected.', ephemeral: true });
        return true;
      }

      if (selected === RESOLUTION_CANCEL_VALUE) {
        session.pendingJump = null;
        await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
        return true;
      }

      const bookId = selected;
      const book = getBookById(bookId);
      if (!book) {
        await interaction.reply({ content: 'Unknown book selection.', ephemeral: true });
        return true;
      }

      const maxChapters = getBookChapterCount(bookId);
      if (maxChapters > 0 && session.pendingJump.chapter > maxChapters) {
        const embed = buildResolutionPromptEmbed({
          title: 'Invalid Chapter',
          descriptionLines: [
            `${book.name} only has ${maxChapters} chapter${maxChapters === 1 ? '' : 's'}.`,
            `You requested chapter ${session.pendingJump.chapter}.`,
            '',
            'Choose a different book or enter a valid reference in Jump.',
          ],
        });
        await interaction.update({
          embeds: [buildEmbed(session), embed],
          components: buildComponentsWithJumpResolution(session),
        });
        return true;
      }

      const pending = session.pendingJump;
      session.pendingJump = null;

      await loadPassagePages(session, {
        bookId,
        chapter: pending.chapter,
        verseSpec: pending.verseSpec,
      });

      const resolvedDisplay = pending.verseSpec
        ? `${book.name} (${book.id}) ${pending.chapter}:${pending.verseSpec}`
        : `${book.name} (${book.id}) ${pending.chapter}`;

      devBotLogs.logEvent('info', 'read.jump.confirmed', {
        sessionId: session.id,
        userId: session.userId,
        bookId,
        chapter: pending.chapter,
        verseSpec: pending.verseSpec || null,
        resolved: resolvedDisplay,
        input: pending.originalReference,
      });

      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

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
    const detailed = parseScriptureReferenceDetailed(reference, { maxCandidates: 5 });

    if (detailed.kind === 'ok') {
      const parsedRef = detailed.parsed;
      session.pendingJump = null;

      await loadPassagePages(session, {
        bookId: parsedRef.bookId,
        chapter: parsedRef.chapter,
        verseSpec: parsedRef.verseSpec,
      });

      devBotLogs.logEvent('info', 'read.jump.resolved', {
        sessionId: session.id,
        userId: session.userId,
        input: reference,
        bookId: parsedRef.bookId,
        chapter: parsedRef.chapter,
        verseSpec: parsedRef.verseSpec || null,
      });

      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session) });
      return true;
    }

    if (detailed.kind === 'needs_confirmation') {
      let verseSpec = null;
      try {
        const parsedVerse = detailed.verseSpecRaw ? parseVerseSpec(detailed.verseSpecRaw) : null;
        verseSpec = parsedVerse?.verseSpec || null;
      } catch (error) {
        await interaction.reply({
          content: error instanceof Error ? error.message : 'Invalid verse specification.',
          ephemeral: Boolean(interaction.guildId),
        });
        return true;
      }

      const candidateBookIds = (detailed.resolver?.candidates || [])
        .map((candidate) => String(candidate?.bookId || '').toUpperCase())
        .filter(Boolean)
        .slice(0, 5);

      session.pendingJump = {
        originalReference: reference,
        bookPart: detailed.bookPart,
        normalizedInput: detailed.normalizedInput,
        chapter: detailed.chapter,
        verseSpec,
        candidateBookIds,
      };

      devBotLogs.logEvent('info', 'read.jump.needs_confirmation', {
        sessionId: session.id,
        userId: session.userId,
        input: reference,
        bookPart: detailed.bookPart,
        chapter: detailed.chapter,
        verseSpec: verseSpec || null,
        candidates: candidateBookIds,
      });

      await interaction.update({
        embeds: [buildEmbed(session), buildJumpResolutionEmbed(session)],
        components: buildComponentsWithJumpResolution(session),
      });
      return true;
    }

    await interaction.reply({
      content: detailed.message || 'Invalid reference.',
      ephemeral: Boolean(interaction.guildId),
    });
    return true;
  }

  logger.warn(`Unhandled read session interaction type for ${interaction.customId}`);
  return false;
}

module.exports = {
  buildReadMessage,
  buildReadResolutionMessage,
  createReadSession,
  handleReadInteraction,
  __private: {
    buildCustomId,
    buildComponents,
    buildComponentsWithJumpResolution,
    buildEmbed,
    buildJumpResolutionEmbed,
    buildJumpModal,
    getSession,
    parseCustomId,
    pruneToMaxSessions,
    sweepExpiredSessions,
  },
};
