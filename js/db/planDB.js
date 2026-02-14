const { logger } = require('../logger.js');
const { getDatabase } = require('./database.js');

function normalizeId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}

function toJsonArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function serializeBooksJson(bookIds) {
  return JSON.stringify(toJsonArray(bookIds));
}

function normalizePlanRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    channelId: row.channel_id || null,
    planType: row.plan_type,
    scope: row.scope,
    books: toJsonArray(row.books_json),
    paceType: row.pace_type,
    paceValue: Number(row.pace_value),
    timezone: row.timezone,
    postTime: row.post_time,
    startDate: row.start_date,
    dayIndex: Number(row.day_index),
    status: row.status,
    lastPostedOn: row.last_posted_on || null,
    lastCompletedOn: row.last_completed_on || null,
    streak: Number(row.streak || 0),
    catchupMode: row.catchup_mode || 'none',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function upsertPlan(options) {
  const ownerType = String(options?.ownerType || '').trim();
  const ownerId = normalizeId(options?.ownerId);
  const channelId = options?.channelId != null ? normalizeId(options.channelId) : null;

  if (!ownerId) {
    throw new Error('ownerId is required.');
  }
  if (ownerType !== 'guild' && ownerType !== 'user') {
    throw new Error('ownerType must be guild or user.');
  }

  const planType = String(options?.planType || '').trim();
  const scope = String(options?.scope || '').trim();
  const paceType = String(options?.paceType || '').trim();
  const paceValue = Number(options?.paceValue);
  const timezone = String(options?.timezone || '').trim();
  const postTime = String(options?.postTime || '').trim();
  const startDate = String(options?.startDate || '').trim();
  const booksJson = serializeBooksJson(options?.books || []);

  if (!planType) {
    throw new Error('planType is required.');
  }
  if (!scope) {
    throw new Error('scope is required.');
  }
  if (!paceType) {
    throw new Error('paceType is required.');
  }
  if (!Number.isFinite(paceValue) || paceValue <= 0) {
    throw new Error('paceValue must be a positive number.');
  }
  if (!timezone) {
    throw new Error('timezone is required.');
  }
  if (!postTime) {
    throw new Error('postTime is required.');
  }
  if (!startDate) {
    throw new Error('startDate is required.');
  }

  try {
    const db = await getDatabase();
    await db.run(
      `INSERT INTO reading_plans (
         owner_type, owner_id, channel_id,
         plan_type, scope, books_json,
         pace_type, pace_value,
         timezone, post_time, start_date,
         status, day_index, catchup_mode,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 'none', CURRENT_TIMESTAMP)
       ON CONFLICT(owner_type, owner_id) DO UPDATE SET
         channel_id = excluded.channel_id,
         plan_type = excluded.plan_type,
         scope = excluded.scope,
         books_json = excluded.books_json,
         pace_type = excluded.pace_type,
         pace_value = excluded.pace_value,
         timezone = excluded.timezone,
         post_time = excluded.post_time,
         start_date = excluded.start_date,
         status = 'active',
         day_index = 0,
         catchup_mode = 'none',
         updated_at = CURRENT_TIMESTAMP`,
      ownerType,
      ownerId,
      channelId,
      planType,
      scope,
      booksJson,
      paceType,
      paceValue,
      timezone,
      postTime,
      startDate,
    );

    return await getPlan(ownerType, ownerId);
  } catch (error) {
    logger.error('Failed to upsert reading plan', error);
    throw error;
  }
}

async function getPlan(ownerType, ownerId) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) {
    return null;
  }

  const normalizedOwnerType = String(ownerType || '').trim();
  if (normalizedOwnerType !== 'guild' && normalizedOwnerType !== 'user') {
    return null;
  }

  const db = await getDatabase();
  const row = await db.get(
    `SELECT *
     FROM reading_plans
     WHERE owner_type = ? AND owner_id = ?
     LIMIT 1`,
    normalizedOwnerType,
    normalizedOwnerId
  );
  return normalizePlanRow(row);
}

async function getPlanById(planId) {
  const normalizedId = Number(planId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return null;
  }

  const db = await getDatabase();
  const row = await db.get(`SELECT * FROM reading_plans WHERE id = ? LIMIT 1`, normalizedId);
  return normalizePlanRow(row);
}

async function listActivePlans() {
  const db = await getDatabase();
  const rows = await db.all(
    `SELECT * FROM reading_plans WHERE status = 'active' ORDER BY created_at ASC`
  );
  return rows.map(normalizePlanRow).filter(Boolean);
}

async function setPlanStatus(planId, status) {
  const normalizedId = Number(planId);
  const normalizedStatus = String(status || '').trim();
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    throw new Error('Invalid plan id.');
  }
  if (!['active', 'paused', 'stopped'].includes(normalizedStatus)) {
    throw new Error('Invalid status.');
  }

  const db = await getDatabase();
  await db.run(
    `UPDATE reading_plans
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    normalizedStatus,
    normalizedId
  );
}

async function bumpDayIndex(planId, newLastPostedOn) {
  const normalizedId = Number(planId);
  const date = newLastPostedOn ? String(newLastPostedOn).trim() : null;
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    throw new Error('Invalid plan id.');
  }

  const db = await getDatabase();
  await db.run(
    `UPDATE reading_plans
     SET day_index = day_index + 1,
         last_posted_on = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    date,
    normalizedId
  );
}

async function skipDays(planId, days) {
  const normalizedId = Number(planId);
  const amount = Number(days || 0);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    throw new Error('Invalid plan id.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('days must be a positive number.');
  }

  const db = await getDatabase();
  await db.run(
    `UPDATE reading_plans
     SET day_index = day_index + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    Math.floor(amount),
    normalizedId
  );
}

async function markComplete(planId, completedOn, options = {}) {
  const normalizedId = Number(planId);
  const date = String(completedOn || '').trim();
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    throw new Error('Invalid plan id.');
  }
  if (!date) {
    throw new Error('completedOn is required.');
  }

  const db = await getDatabase();
  const current = await getPlanById(normalizedId);
  if (!current) {
    throw new Error('Plan not found.');
  }

  if (current.lastCompletedOn === date) {
    return current;
  }

  const previousDate = current.lastCompletedOn;
  let streak = Number(current.streak || 0);

  if (options.previousDay === true) {
    streak += 1;
  } else if (!previousDate) {
    streak = 1;
  } else {
    // Default behavior: reset streak unless caller confirms previousDay continuity.
    streak = 1;
  }

  await db.run(
    `UPDATE reading_plans
     SET last_completed_on = ?,
         streak = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    date,
    streak,
    normalizedId
  );

  return await getPlanById(normalizedId);
}

module.exports = {
  getPlan,
  getPlanById,
  listActivePlans,
  markComplete,
  bumpDayIndex,
  setPlanStatus,
  skipDays,
  upsertPlan,
  __private: {
    normalizePlanRow,
    serializeBooksJson,
    toJsonArray,
  },
};

