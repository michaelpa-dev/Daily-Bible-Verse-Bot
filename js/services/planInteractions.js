const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { logger } = require('../logger.js');
const { getPlanById, markComplete } = require('../db/planDB.js');
const { getReadingForDay, buildReferenceLabel } = require('./planEngine.js');
const { fetchPassageForBookChapter } = require('./bibleApiWeb.js');
const { paginateLines } = require('./pagination.js');
const { createPaginatedMessage } = require('./paginationInteractions.js');
const { formatPassageLines } = require('./passageFormatter.js');

function parsePlanCustomId(customId) {
  const raw = String(customId || '');
  if (!raw.startsWith('plan|')) {
    return null;
  }

  const parts = raw.split('|');
  if (parts.length < 3) {
    return null;
  }

  return {
    planId: Number(parts[1] || 0),
    action: parts[2],
    dayIndex: parts[3] != null ? Number(parts[3]) : null,
    localDate: parts[4] != null ? String(parts[4]) : null,
  };
}

function toDateFromYmd(ymd) {
  const value = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return new Date(`${value}T12:00:00Z`);
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function isPreviousDay(previousYmd, currentYmd) {
  const current = toDateFromYmd(currentYmd);
  if (!current) {
    return false;
  }
  const yesterday = new Date(current.getTime() - 24 * 60 * 60 * 1000);
  return String(previousYmd || '').trim() === formatYmd(yesterday);
}

async function buildReadingPages(refs) {
  const lines = [];

  for (const ref of refs) {
    lines.push(`__${buildReferenceLabel(ref)}__`);
    const passage = await fetchPassageForBookChapter(ref.bookId, ref.chapter, ref.verseSpec, {
      translation: 'web',
    });
    lines.push(...formatPassageLines(passage));
  }

  return paginateLines(lines, { maxChars: 3400 });
}

function buildCompletionRow(planId, dayIndex, localDate) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`plan|${planId}|complete|${dayIndex}|${localDate}`)
      .setLabel('Mark Complete ✅')
      .setStyle(ButtonStyle.Success),
  );

  return [row];
}

async function sendUserPlanReading(client, plan, dayIndex, localDate, options = {}) {
  const targetUserId = String(options.targetUserId || '').trim();
  if (!targetUserId) {
    throw new Error('targetUserId is required.');
  }

  const refs = getReadingForDay(plan, dayIndex);
  const pages = await buildReadingPages(refs);

  const extraComponents = options.includeCompletion
    ? buildCompletionRow(plan.id, dayIndex, localDate)
    : [];

  const title = `Plan: ${plan.planType} • Day ${dayIndex + 1}${options.late ? ' (late)' : ''}`;
  const footer = `Reading plan • ${localDate}`;

  const paginated = createPaginatedMessage({
    kind: 'plan-reading',
    userId: targetUserId,
    pages,
    title,
    color: '#0099ff',
    footer,
    extraComponents,
    ttlMs: 25 * 60 * 1000,
  });

  const payload = {
    embeds: [paginated.embed],
    components: paginated.components,
  };

  const user = await client.users.fetch(targetUserId).catch(() => null);
  if (!user) {
    logger.warn(`Unable to fetch user ${targetUserId} for plan DM.`);
    return false;
  }

  await user.send(payload);
  return true;
}

async function handlePlanInteraction(interaction) {
  if (!interaction.isButton()) {
    return false;
  }

  const parsed = parsePlanCustomId(interaction.customId);
  if (!parsed) {
    return false;
  }

  if (!Number.isFinite(parsed.planId) || parsed.planId <= 0) {
    await interaction.reply({ content: 'Invalid plan id.', ephemeral: true });
    return true;
  }

  const plan = await getPlanById(parsed.planId);
  if (!plan) {
    await interaction.reply({ content: 'This plan no longer exists.', ephemeral: true });
    return true;
  }

  if (parsed.action === 'dm') {
    const dayIndex = Number.isFinite(parsed.dayIndex) && parsed.dayIndex >= 0 ? parsed.dayIndex : plan.dayIndex;
    const localDate = parsed.localDate || 'today';

    try {
      await sendUserPlanReading(interaction.client, plan, dayIndex, localDate, {
        targetUserId: interaction.user.id,
        includeCompletion: false,
      });
    } catch (error) {
      logger.error('Failed to DM plan reading', error);
      await interaction.reply({ content: 'Failed to send DM reading.', ephemeral: true });
      return true;
    }

    await interaction.reply({ content: 'Sent you a DM with today’s reading.', ephemeral: true });
    return true;
  }

  if (parsed.action === 'complete') {
    const localDate = parsed.localDate;
    if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      await interaction.reply({ content: 'Invalid completion date.', ephemeral: true });
      return true;
    }

    if (plan.ownerType !== 'user' || plan.ownerId !== interaction.user.id) {
      await interaction.reply({ content: 'You can only complete your own plan.', ephemeral: true });
      return true;
    }

    const previousDay = isPreviousDay(plan.lastCompletedOn, localDate);
    await markComplete(plan.id, localDate, { previousDay });
    await interaction.reply({ content: `Marked complete for ${localDate}.`, ephemeral: true });
    return true;
  }

  await interaction.reply({ content: 'Unknown plan action.', ephemeral: true });
  return true;
}

module.exports = {
  handlePlanInteraction,
  sendUserPlanReading,
  __private: {
    buildReadingPages,
    isPreviousDay,
    parsePlanCustomId,
  },
};

