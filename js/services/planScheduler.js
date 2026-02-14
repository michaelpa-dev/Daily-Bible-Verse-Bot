const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const { logger } = require('../logger.js');
const { listActivePlans, getPlanById, bumpDayIndex, setPlanStatus } = require('../db/planDB.js');
const { getReadingForDay, buildReferenceLabel } = require('./planEngine.js');

const tasks = new Map();

function parsePostTime(postTime) {
  const raw = String(postTime || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid postTime "${postTime}". Use HH:MM (24h).`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid postTime hour "${match[1]}".`);
  }
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid postTime minute "${match[2]}".`);
  }

  return { hour, minute };
}

function formatLocalDate(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function formatLocalTimeParts(timezone, date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  return { hour, minute };
}

function buildGuildPlanSummaryEmbed(plan, localDate, refs) {
  const title = `Reading Plan: ${plan.planType}`;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('#0099ff')
    .setTimestamp(new Date())
    .setDescription(
      `**Today's reading (${localDate})**\n` +
        refs.map((ref) => `- ${buildReferenceLabel(ref)}`).join('\n')
    )
    .setFooter({
      text: 'Use the button below to DM yourself today’s reading (with pagination).',
    });

  return embed;
}

function buildGuildPlanComponents(planId, dayIndex, localDate) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`plan|${planId}|dm|${dayIndex}|${localDate}`)
      .setLabel("DM me today's reading")
      .setStyle(ButtonStyle.Primary)
  );

  return [row];
}

async function postPlanTick(client, planId, options = {}) {
  const plan = await getPlanById(planId);
  if (!plan || plan.status !== 'active') {
    return;
  }

  const localDate = formatLocalDate(plan.timezone);
  if (plan.startDate && localDate < plan.startDate) {
    // Respect future-dated plans: don't post until the plan's start date in its timezone.
    return;
  }
  if (plan.lastPostedOn === localDate) {
    return;
  }

  const refs = getReadingForDay(plan, plan.dayIndex);
  if (refs.length === 0) {
    logger.info(`Plan ${plan.id} has no more readings. Marking stopped.`);
    await setPlanStatus(plan.id, 'stopped');
    const task = tasks.get(plan.id);
    if (task) {
      try {
        task.stop();
      } catch {
        // ignore
      }
      tasks.delete(plan.id);
    }
    return;
  }

  if (plan.ownerType === 'guild') {
    if (!plan.channelId) {
      logger.warn(`Guild plan ${plan.id} has no channelId; skipping post.`);
      return;
    }

    const channel = await client.channels.fetch(plan.channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') {
      logger.warn(`Unable to fetch channel ${plan.channelId} for plan ${plan.id}`);
      return;
    }

    const embed = buildGuildPlanSummaryEmbed(plan, localDate, refs);
    const components = buildGuildPlanComponents(plan.id, plan.dayIndex, localDate);

    const lateSuffix = options.late ? ' (late)' : '';
    embed.setTitle(`Reading Plan: ${plan.planType}${lateSuffix}`);
    await channel.send({ embeds: [embed], components });
  } else {
    // User plan: DM the full reading (with pagination).
    const { sendUserPlanReading } = require('./planInteractions.js');
    await sendUserPlanReading(client, plan, plan.dayIndex, localDate, {
      targetUserId: plan.ownerId,
      includeCompletion: true,
      late: options.late === true,
    });
  }

  await bumpDayIndex(plan.id, localDate);
}

function stopAllTasks() {
  for (const task of tasks.values()) {
    try {
      task.stop();
    } catch {
      // ignore
    }
  }
  tasks.clear();
}

async function refreshPlanSchedules(client) {
  stopAllTasks();

  const plans = await listActivePlans();
  for (const plan of plans) {
    try {
      const { hour, minute } = parsePostTime(plan.postTime);
      const expression = `${minute} ${hour} * * *`;

      const task = cron.schedule(
        expression,
        async () => {
          try {
            await postPlanTick(client, plan.id);
          } catch (error) {
            logger.error(`Plan tick failed for plan ${plan.id}`, error);
          }
        },
        {
          timezone: plan.timezone,
        }
      );

      tasks.set(plan.id, task);
    } catch (error) {
      logger.error(`Failed to schedule plan ${plan.id}`, error);
    }
  }
}

async function postLatePlans(client) {
  const plans = await listActivePlans();
  for (const plan of plans) {
    try {
      const localDate = formatLocalDate(plan.timezone);
      if (plan.startDate && localDate < plan.startDate) {
        continue;
      }
      if (plan.lastPostedOn === localDate) {
        continue;
      }

      const { hour: nowHour, minute: nowMinute } = formatLocalTimeParts(plan.timezone);
      const { hour: postHour, minute: postMinute } = parsePostTime(plan.postTime);

      const nowTotal = nowHour * 60 + nowMinute;
      const postTotal = postHour * 60 + postMinute;

      if (nowTotal < postTotal) {
        continue;
      }

      await postPlanTick(client, plan.id, { late: true });
    } catch (error) {
      logger.error(`Failed to post late plan ${plan.id}`, error);
    }
  }
}

async function initializePlanScheduler(client) {
  await refreshPlanSchedules(client);
  await postLatePlans(client);
}

module.exports = {
  initializePlanScheduler,
  refreshPlanSchedules,
  __private: {
    formatLocalDate,
    formatLocalTimeParts,
    parsePostTime,
    postPlanTick,
    tasks,
  },
};
