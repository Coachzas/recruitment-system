'use strict';

const cron = require('node-cron');
const { listActiveSchedulerProfiles, saveSchedulerRunSummary } = require('../services/storageService');
const { pollUnreadEmails }                                   = require('../services/emailService');

// Map<profileId, { tasks: Array<{task, expression}>, profile }>
const activeTasks = new Map();

// Set of profile IDs whose cron job is currently executing a batch fetch
const _firingCycles = new Set();

// ─── Day normalisation ────────────────────────────────────────────────────────

const DAY_NAME_TO_NUM = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function dayToNum(d) {
  const s = String(d).trim();
  const n = Number(s);
  if (!isNaN(n)) return n % 7;
  return DAY_NAME_TO_NUM[s.toLowerCase()] ?? -1;
}

function dayToCron(d) {
  const s = String(d).trim();
  if (/^\d$/.test(s)) return s;
  return s.toLowerCase();
}

// ─── Cron helpers ─────────────────────────────────────────────────────────────

function buildCronForTime(timeStr, daysPart) {
  const [h = '0', m = '0'] = timeStr.split(':');
  const hour   = parseInt(h, 10);
  const minute = parseInt(m, 10);
  return `${minute} ${hour} * * ${daysPart}`;
}

// ─── Next-run calculator ──────────────────────────────────────────────────────
// Finds the earliest upcoming run across all times in the profile.

function computeNextRun(profile) {
  if (!profile || !profile.is_active) return null;

  const runTimes = Array.isArray(profile.run_times) ? profile.run_times : [];
  if (!runTimes.length) return null;

  const now     = new Date();
  const rawDays = Array.isArray(profile.days_to_run) ? profile.days_to_run : [];
  const dayNums = rawDays.length
    ? rawDays.map(dayToNum).filter((n) => n >= 0)
    : [0, 1, 2, 3, 4, 5, 6];

  let earliest = null;

  for (const timeStr of runTimes) {
    const parts    = timeStr.split(':');
    const targetH  = parseInt(parts[0], 10);
    const targetM  = parseInt(parts[1] || '0', 10);

    for (let offset = 0; offset <= 7; offset++) {
      const c = new Date(now);
      c.setDate(c.getDate() + offset);
      c.setHours(targetH, targetM, 0, 0);

      if (dayNums.includes(c.getDay()) && c > now) {
        if (!earliest || c < new Date(earliest)) earliest = c.toISOString();
        break; // earliest future hit for this time slot found
      }
    }
  }

  return earliest;
}

// ─── Run summary builder ──────────────────────────────────────────────────────

function buildRunSummary(summary, applicantsSaved) {
  const { found, processed, skipped_dedup, quota_stopped, reason_zero } = summary;

  if (found === 0) {
    if (reason_zero === 'all_seen')    return 'All messages already seen — inbox up to date.';
    if (reason_zero === 'empty_window') return 'No new messages in inbox.';
    return 'No messages found.';
  }

  const parts = [`Found ${found}`];
  if (skipped_dedup > 0) parts.push(`${skipped_dedup} already logged (skipped)`);
  parts.push(`${processed} processed`);
  if (applicantsSaved > 0) parts.push(`${applicantsSaved} applicant(s) saved`);
  if (quota_stopped) parts.push('stopped early — API quota');
  return parts.join(' · ');
}

// ─── Per-profile cycle ────────────────────────────────────────────────────────

async function runProfileCycle(profile) {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.active_from && today < profile.active_from) {
    console.log(`[Scheduler] "${profile.profile_name}" not yet in active period — skipping.`);
    return;
  }
  if (profile.active_to && today > profile.active_to) {
    console.log(`[Scheduler] "${profile.profile_name}" past active period — skipping.`);
    return;
  }

  // Build the IMAP date window from the profile's active_from / active_to.
  // Falls back to the last 24 hours when no date range is configured.
  const since = profile.active_from
    ? new Date(profile.active_from)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  // IMAP BEFORE is exclusive — add 1 day so emails received ON active_to are included.
  let before = null;
  if (profile.active_to) {
    before = new Date(profile.active_to);
    before.setUTCDate(before.getUTCDate() + 1);
  }

  const batchCap = profile.max_emails_per_batch || 20;
  console.log(
    `[Scheduler] "${profile.profile_name}" fired — ` +
    `since: ${since.toISOString().slice(0, 10)}, ` +
    `before: ${before ? before.toISOString().slice(0, 10) : '(now)'}, ` +
    `batch: ${batchCap}`
  );
  _firingCycles.add(profile.id);

  let runSummaryText = 'Run failed.';
  try {
    const { results, summary } = await pollUnreadEmails({
      maxBatch: batchCap,
      interEmailDelayMs: 1500,
      since,
      ...(before && { before }),
      includeRead: true,
    });
    const saved = results.filter((r) => r.applicantId).length;
    runSummaryText = buildRunSummary(summary, saved);
    console.log(`[Scheduler] "${profile.profile_name}" complete — ${runSummaryText}`);
  } catch (err) {
    console.error(`[Scheduler] "${profile.profile_name}" failed:`, err.message);
    runSummaryText = `Error: ${err.message}`;
  } finally {
    _firingCycles.delete(profile.id);
    try { await saveSchedulerRunSummary(profile.id, runSummaryText); } catch {}
  }
}

// ─── Per-profile task control ─────────────────────────────────────────────────

function startProfileTask(profile) {
  stopProfileTask(profile.id); // always clean up before re-registering

  const runTimes = Array.isArray(profile.run_times) ? profile.run_times.filter(Boolean) : [];
  if (!runTimes.length) {
    console.warn(`[Scheduler] "${profile.profile_name}" has no run_times configured — skipped.`);
    return;
  }

  const rawDays  = Array.isArray(profile.days_to_run) ? profile.days_to_run : [];
  const daysPart = rawDays.length ? rawDays.map(dayToCron).join(',') : '*';

  const registeredTasks = [];

  for (const timeStr of runTimes) {
    const expression = buildCronForTime(timeStr, daysPart);

    if (!cron.validate(expression)) {
      console.error(`[Scheduler] "${profile.profile_name}" invalid cron "${expression}" for time ${timeStr} — skipped.`);
      continue;
    }

    const task = cron.schedule(expression, () => runProfileCycle(profile));
    registeredTasks.push({ task, expression });
    console.log(`[Scheduler] "${profile.profile_name}" — registered ${timeStr} → "${expression}"`);
  }

  if (registeredTasks.length) {
    activeTasks.set(profile.id, { tasks: registeredTasks, profile });
    console.log(`[Scheduler] "${profile.profile_name}" (id:${profile.id}) has ${registeredTasks.length} active cron job(s).`);
  }
}

function stopProfileTask(profileId) {
  const entry = activeTasks.get(profileId);
  if (entry) {
    entry.tasks.forEach(({ task }) => task.stop());
    activeTasks.delete(profileId);
    console.log(`[Scheduler] Profile id:${profileId} stopped (${entry.tasks.length} job(s)).`);
  }
}

// ─── Global control ───────────────────────────────────────────────────────────

async function reschedule() {
  for (const [id, entry] of activeTasks) {
    entry.tasks.forEach(({ task }) => task.stop());
    console.log(`[Scheduler] Cleared existing tasks for profile id:${id}.`);
  }
  activeTasks.clear();

  const profiles = await listActiveSchedulerProfiles();

  if (!profiles.length) {
    console.log('[Scheduler] No active profiles — idle.');
    return { active: 0 };
  }

  for (const profile of profiles) {
    startProfileTask(profile);
  }

  console.log(`[Scheduler] ${activeTasks.size} profile(s) running.`);
  return { active: activeTasks.size };
}

function getStatus() {
  const running = [];
  for (const [id, entry] of activeTasks) {
    running.push({
      id,
      profile_name: entry.profile.profile_name,
      expressions:  entry.tasks.map((t) => t.expression),
      next_run:     computeNextRun(entry.profile),
      is_firing:    _firingCycles.has(id),
    });
  }
  return { count: activeTasks.size, profiles: running, firing: [..._firingCycles] };
}

module.exports = {
  reschedule,
  startProfileTask,
  stopProfileTask,
  getStatus,
  computeNextRun,
};
