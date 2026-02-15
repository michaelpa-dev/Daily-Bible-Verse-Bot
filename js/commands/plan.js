const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');

const { addCommandExecution } = require('../db/statsDB.js');
const { getPlan, getPlanById, setPlanStatus, skipDays, upsertPlan } = require('../db/planDB.js');
const { logger } = require('../logger.js');
const { PLAN_TYPES, getReadingForDay, buildReferenceLabel } = require('../services/planEngine.js');
const { refreshPlanSchedules } = require('../services/planScheduler.js');
const { paginateLines } = require('../services/pagination.js');
const { createPaginatedMessage } = require('../services/paginationInteractions.js');
const { fetchPassageForBookChapter } = require('../services/bibleApiWeb.js');
const { formatPassageLines } = require('../services/passageFormatter.js');
const { logCommandError } = require('../services/botOps.js');
const { resolvePlanOwnerContext } = require('../services/planTarget.js');
const { normalizeBookId } = require('../constants/books.js');

const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_POST_TIME = '08:00';

const PLAN_TARGET_CHOICES = [
  { name: 'Server (post in channel)', value: 'server' },
  { name: 'Me (DM)', value: 'me' },
];

function formatLocalDate(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function parseBooksList(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return [];
  }

  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const resolved = [];
  for (const part of parts) {
    const bookId = normalizeBookId(part);
    if (bookId) {
      resolved.push(bookId);
    }
  }

  return Array.from(new Set(resolved));
}

function pickPlanDefaults(planType) {
  if (planType === 'psalms-proverbs') {
    return { scope: 'SpecificBooks', books: ['PSA', 'PRO'], paceType: 'chapters', paceValue: 2 };
  }

  if (planType === 'gospels-30') {
    return {
      scope: 'SpecificBooks',
      books: ['MAT', 'MRK', 'LUK', 'JHN'],
      paceType: 'chapters',
      paceValue: 3,
    };
  }

  if (planType === 'new-testament-90') {
    return { scope: 'NT', books: [], paceType: 'chapters', paceValue: 3 };
  }

  if (planType === 'one-year') {
    return { scope: 'Both', books: [], paceType: 'chapters', paceValue: 3 };
  }

  return { scope: 'Both', books: [], paceType: 'chapters', paceValue: 3 };
}

function resolvePace(options) {
  const chaptersPerDay = options.chaptersPerDay;
  const versesPerDay = options.versesPerDay;
  const minutesPerDay = options.minutesPerDay;

  const chosen = [chaptersPerDay != null, versesPerDay != null, minutesPerDay != null].filter(
    Boolean
  ).length;
  if (chosen > 1) {
    throw new Error('Choose only one pace option: chaptersPerDay, versesPerDay, or minutesPerDay.');
  }

  if (chaptersPerDay != null) {
    return { paceType: 'chapters', paceValue: Number(chaptersPerDay) };
  }
  if (versesPerDay != null) {
    return { paceType: 'verses', paceValue: Number(versesPerDay) };
  }
  if (minutesPerDay != null) {
    return { paceType: 'minutes', paceValue: Number(minutesPerDay) };
  }
  return null;
}

async function buildTodayReadingPages(plan, dayIndex) {
  const refs = getReadingForDay(plan, dayIndex);
  if (refs.length === 0) {
    return { refs: [], pages: ['(plan complete)'] };
  }

  const lines = [];
  for (const ref of refs) {
    lines.push(`__${buildReferenceLabel(ref)}__`);
    const passage = await fetchPassageForBookChapter(ref.bookId, ref.chapter, ref.verseSpec, {
      translation: 'web',
    });
    lines.push(...formatPassageLines(passage));
  }

  return { refs, pages: paginateLines(lines, { maxChars: 3400 }) };
}

function buildPlanSummaryEmbed(plan, options = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`Reading Plan: ${plan.planType}`)
    .setColor('#0099ff')
    .setTimestamp(new Date())
    .addFields(
      { name: 'Status', value: plan.status, inline: true },
      { name: 'Day', value: String(plan.dayIndex + 1), inline: true },
      { name: 'Timezone', value: plan.timezone, inline: true },
      { name: 'Post Time', value: plan.postTime, inline: true }
    );

  if (plan.ownerType === 'guild') {
    embed.addFields({
      name: 'Channel',
      value: plan.channelId ? `<#${plan.channelId}>` : '(not set)',
    });
  }

  if (options.note) {
    embed.setDescription(options.note);
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plan')
    .setDescription('Reading plan system')
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('List available plan templates')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start or replace a reading plan (guild or DM)')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Where this plan lives (server posts vs your DMs)')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
        .addStringOption((option) =>
          option
            .setName('plan_type')
            .setDescription('Plan template')
            .setRequired(true)
            .addChoices(
              { name: 'One Year (Bible)', value: 'one-year' },
              { name: 'Gospels (30 days)', value: 'gospels-30' },
              { name: 'Psalms + Proverbs (daily)', value: 'psalms-proverbs' },
              { name: 'New Testament (90 days)', value: 'new-testament-90' },
              { name: 'Custom', value: 'custom' }
            )
        )
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Reading scope (custom plans)')
            .setRequired(false)
            .addChoices(
              { name: 'Old Testament', value: 'OT' },
              { name: 'New Testament', value: 'NT' },
              { name: 'Both', value: 'Both' },
              { name: 'Specific Books', value: 'SpecificBooks' }
            )
        )
        .addStringOption((option) =>
          option
            .setName('books')
            .setDescription('Comma-separated books for SpecificBooks (ex: JHN, ROM, PSA)')
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('chapters_per_day')
            .setDescription('Pace override: chapters per day')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('verses_per_day')
            .setDescription('Pace override: verses per day (approx converted to chapters)')
            .setMinValue(10)
            .setMaxValue(500)
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('minutes_per_day')
            .setDescription('Pace override: minutes per day (approx converted to chapters)')
            .setMinValue(5)
            .setMaxValue(120)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('start_date')
            .setDescription('Start date (YYYY-MM-DD). Default: today in timezone.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('timezone')
            .setDescription(`IANA timezone. Default: ${DEFAULT_TIMEZONE}`)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('post_time')
            .setDescription(`Daily post time (HH:MM 24h). Default: ${DEFAULT_POST_TIME}`)
            .setRequired(false)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the daily reading (guild plans only)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show your current plan status')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('View the server plan or your personal DM plan')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('today')
        .setDescription("Show today's reading (with pagination)")
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('View the server plan or your personal DM plan')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('pause')
        .setDescription('Pause the current plan')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Pause the server plan or your personal DM plan')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('resume')
        .setDescription('Resume the current plan')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Resume the server plan or your personal DM plan')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('stop')
        .setDescription('Stop the current plan')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Stop the server plan or your personal DM plan')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('skip')
        .setDescription('Skip ahead in the plan by N days')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Skip the server plan or your personal DM plan')
            .setRequired(false)
            .addChoices(...PLAN_TARGET_CHOICES)
        )
        .addIntegerOption((option) =>
          option
            .setName('days')
            .setDescription('Days to skip (default 1)')
            .setMinValue(1)
            .setMaxValue(30)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    await addCommandExecution();
    const subcommand = interaction.options.getSubcommand();

    const requestedTarget = interaction.options.getString('target');
    const ownerContext = resolvePlanOwnerContext({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      target: requestedTarget,
    });

    logger.info(
      `Slash command /plan ${subcommand} called by ${interaction.user.id} target=${ownerContext.target} ownerType=${ownerContext.ownerType}`
    );

    try {
      if (subcommand === 'list') {
        const embed = new EmbedBuilder()
          .setTitle('Reading Plan Templates')
          .setColor('#0099ff')
          .setDescription(
            [
              '- `one-year`: Full Bible in 365 days (3-4 chapters/day).',
              '- `new-testament-90`: New Testament in 90 days.',
              '- `gospels-30`: Matthew, Mark, Luke, John in 30 days.',
              '- `psalms-proverbs`: 1 Psalm + 1 Proverb per day (cycles).',
              '- `custom`: Sequential chapters by scope/books with a configurable pace.',
            ].join('\n')
          )
          .setTimestamp(new Date());

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (subcommand === 'start') {
        const planType = interaction.options.getString('plan_type');
        if (!PLAN_TYPES.includes(planType)) {
          throw new Error(`Invalid plan_type: ${planType}`);
        }

        const timezone = interaction.options.getString('timezone') || DEFAULT_TIMEZONE;
        const postTime = interaction.options.getString('post_time') || DEFAULT_POST_TIME;

        const startDateInput = interaction.options.getString('start_date');
        const startDate =
          startDateInput && /^\d{4}-\d{2}-\d{2}$/.test(startDateInput)
            ? startDateInput
            : formatLocalDate(timezone);

        const defaults = pickPlanDefaults(planType);
        const scopeOverride = interaction.options.getString('scope');
        const scope = planType === 'custom' ? scopeOverride || defaults.scope : defaults.scope;

        const booksRaw = interaction.options.getString('books');
        const parsedBooks = scope === 'SpecificBooks' ? parseBooksList(booksRaw) : [];
        const books =
          scope === 'SpecificBooks'
            ? parsedBooks.length > 0
              ? parsedBooks
              : defaults.books
            : defaults.books;

        const paceOverride = resolvePace({
          chaptersPerDay: interaction.options.getInteger('chapters_per_day'),
          versesPerDay: interaction.options.getInteger('verses_per_day'),
          minutesPerDay: interaction.options.getInteger('minutes_per_day'),
        });

        const pace = paceOverride || { paceType: defaults.paceType, paceValue: defaults.paceValue };
        const channelId =
          ownerContext.ownerType === 'guild'
            ? interaction.options.getChannel('channel')?.id || interaction.channelId
            : null;

        const plan = await upsertPlan({
          ownerType: ownerContext.ownerType,
          ownerId: ownerContext.ownerId,
          channelId,
          planType,
          scope,
          books,
          paceType: pace.paceType,
          paceValue: pace.paceValue,
          timezone,
          postTime,
          startDate,
        });

        await refreshPlanSchedules(interaction.client);

        const note =
          ownerContext.ownerType === 'guild'
            ? `Daily posts will go to <#${plan.channelId}> at ${plan.postTime} (${plan.timezone}).`
            : `Daily DMs will be sent at ${plan.postTime} (${plan.timezone}).\nManage it from a server with \`/plan status target:Me (DM)\`.`;

        await interaction.reply({
          embeds: [buildPlanSummaryEmbed(plan, { note })],
          ephemeral: true,
        });
        return;
      }

      const plan = await getPlan(ownerContext.ownerType, ownerContext.ownerId);
      if (!plan) {
        const suffix =
          ownerContext.ownerType === 'user'
            ? ' Use `/plan start target:Me (DM)` to create a personal plan.'
            : ' Use `/plan start` to create a server plan.';
        await interaction.reply({
          content: `No reading plan found for this target.${suffix}`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'status') {
        await interaction.reply({ embeds: [buildPlanSummaryEmbed(plan)], ephemeral: true });
        return;
      }

      if (subcommand === 'today') {
        const localDate = formatLocalDate(plan.timezone);
        const { refs, pages } = await buildTodayReadingPages(plan, plan.dayIndex);

        if (refs.length === 0) {
          await interaction.reply({
            content: 'This plan has completed all scheduled readings.',
            ephemeral: true,
          });
          return;
        }

        const title = `Today's Reading • ${localDate}`;
        const footer = `Plan: ${plan.planType} • ${plan.timezone}`;

        const paginated = createPaginatedMessage({
          kind: 'plan-today',
          userId: interaction.user.id,
          pages,
          title,
          color: '#0099ff',
          footer,
          ttlMs: 25 * 60 * 1000,
        });

        await interaction.reply({
          embeds: [paginated.embed],
          components: paginated.components,
          ephemeral: Boolean(interaction.guildId),
        });
        return;
      }

      if (subcommand === 'pause') {
        await setPlanStatus(plan.id, 'paused');
        await refreshPlanSchedules(interaction.client);
        await interaction.reply({
          embeds: [buildPlanSummaryEmbed({ ...plan, status: 'paused' })],
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'resume') {
        await setPlanStatus(plan.id, 'active');
        await refreshPlanSchedules(interaction.client);
        const refreshed = await getPlanById(plan.id);
        await interaction.reply({ embeds: [buildPlanSummaryEmbed(refreshed)], ephemeral: true });
        return;
      }

      if (subcommand === 'stop') {
        await setPlanStatus(plan.id, 'stopped');
        await refreshPlanSchedules(interaction.client);
        await interaction.reply({ content: 'Plan stopped.', ephemeral: true });
        return;
      }

      if (subcommand === 'skip') {
        const days = interaction.options.getInteger('days') || 1;
        await skipDays(plan.id, days);
        const refreshed = await getPlanById(plan.id);
        await interaction.reply({
          embeds: [buildPlanSummaryEmbed(refreshed, { note: `Skipped ahead ${days} day(s).` })],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({ content: 'Not implemented yet.', ephemeral: true });
    } catch (error) {
      logger.error('Plan command failed', error);
      await logCommandError(interaction, error, 'Plan command failed');

      const message =
        error instanceof Error && error.message
          ? `Plan error: ${error.message}`
          : 'An error occurred while handling the plan command.';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
  },
};
