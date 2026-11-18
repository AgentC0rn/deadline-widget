import { describe, expect, it } from 'vitest';
import {
  addLocalJob,
  createEmptyTrackerState,
  evaluateAlertsAt,
  reconcileSheetJobs,
  snoozeJobAlert,
  toggleJobCompletion,
} from '../src/core/deadlineTracker';
import {
  DEFAULT_TROLL_MESSAGES,
  createDefaultSettings,
  sanitizeAppSettings,
} from '../src/core/settings';

describe('DeadlineAlert, Snooze, Anti-Flood & Settings — Tickets 03 & 04', () => {
  const T0 = Date.parse('2026-11-18T10:00:00.000Z');

  it('suppresses DeadlineAlert popups for newly imported Sheet Jobs already overdue > 15m, while alerting recent/live expirations', () => {
    let state = createEmptyTrackerState();
    state = reconcileSheetJobs(
      state,
      [
        {
          id: 'sheet:old-1',
          title: 'Job tuần trước 1',
          description: '',
          deadlineMs: T0 - 48 * 3_600_000, // 2 days overdue
        },
        {
          id: 'sheet:old-2',
          title: 'Job sáng sớm nay',
          description: '',
          deadlineMs: T0 - 30 * 60_000, // 30m overdue -> historical
        },
        {
          id: 'sheet:just-expired',
          title: 'Job vừa trễ 2 phút',
          description: 'Cần gửi gấp',
          deadlineMs: T0 - 2 * 60_000, // 2m overdue -> within 15m grace, should alert!
        },
      ],
      T0,
    );

    const evalResult = evaluateAlertsAt(state, {
      nowMs: T0,
      alertMode: 'troll',
      trollMessages: ['Sếp đang nhìn kìa!'],
    });

    expect(evalResult.deadlineAlerts).toHaveLength(1);
    expect(evalResult.deadlineAlerts[0]?.jobId).toBe('sheet:just-expired');
    expect(evalResult.deadlineAlerts[0]?.alertMode).toBe('troll');
    expect(evalResult.deadlineAlerts[0]?.trollMessage).toBe('Sếp đang nhìn kìa!');

    // Re-evaluating at T0 + 1s does not duplicate the popup
    const secondEval = evaluateAlertsAt(evalResult.state, {
      nowMs: T0 + 1_000,
      alertMode: 'troll',
      trollMessages: ['Sếp đang nhìn kìa!'],
    });
    expect(secondEval.deadlineAlerts).toHaveLength(0);
  });

  it('fires < 15m pre-deadline cue once, fires DeadlineAlert at 00:00:00, and re-fires after Snooze expires unless completed', () => {
    let state = createEmptyTrackerState();
    state = addLocalJob(
      state,
      {
        id: 'job-live',
        title: 'Gửi proposal',
        description: 'File PDF cuối cùng',
        deadlineMs: T0 + 20 * 60_000, // +20m
      },
      T0,
    );

    // At +6m (14m remaining) -> fires preDeadlineCue once
    const at14mLeft = evaluateAlertsAt(state, {
      nowMs: T0 + 6 * 60_000,
      alertMode: 'serious',
      trollMessages: DEFAULT_TROLL_MESSAGES,
    });
    expect(at14mLeft.preDeadlineCues).toHaveLength(1);
    expect(at14mLeft.preDeadlineCues[0]?.jobId).toBe('job-live');
    expect(at14mLeft.deadlineAlerts).toHaveLength(0);
    state = at14mLeft.state;

    // At +20m (00:00:00) -> fires Serious DeadlineAlert
    const atDeadline = evaluateAlertsAt(state, {
      nowMs: T0 + 20 * 60_000,
      alertMode: 'serious',
      trollMessages: DEFAULT_TROLL_MESSAGES,
    });
    expect(atDeadline.deadlineAlerts).toHaveLength(1);
    expect(atDeadline.deadlineAlerts[0]?.alertMode).toBe('serious');
    expect(atDeadline.deadlineAlerts[0]?.trollMessage).toBeUndefined();
    state = atDeadline.state;

    // User clicks Snooze 10 minutes
    const snoozeStart = T0 + 20 * 60_000 + 10_000;
    state = snoozeJobAlert(state, 'job-live', 10, snoozeStart);

    // 9 minutes into Snooze -> no popup
    const beforeSnoozeEnd = evaluateAlertsAt(state, {
      nowMs: snoozeStart + 9 * 60_000,
      alertMode: 'troll',
      trollMessages: ['Hết giờ khất rồi bạn ơi!'],
    });
    expect(beforeSnoozeEnd.deadlineAlerts).toHaveLength(0);

    // 10 minutes into Snooze -> popup fires again!
    const afterSnoozeEnd = evaluateAlertsAt(beforeSnoozeEnd.state, {
      nowMs: snoozeStart + 10 * 60_000,
      alertMode: 'troll',
      trollMessages: ['Hết giờ khất rồi bạn ơi!'],
    });
    expect(afterSnoozeEnd.deadlineAlerts).toHaveLength(1);
    expect(afterSnoozeEnd.deadlineAlerts[0]?.trollMessage).toBe('Hết giờ khất rồi bạn ơi!');
    state = afterSnoozeEnd.state;

    // Snooze again, then complete before Snooze expires -> never fires again
    state = snoozeJobAlert(state, 'job-live', 5, snoozeStart + 11 * 60_000);
    state = toggleJobCompletion(state, 'job-live', snoozeStart + 12 * 60_000);
    const afterComplete = evaluateAlertsAt(state, {
      nowMs: snoozeStart + 20 * 60_000,
      alertMode: 'troll',
      trollMessages: DEFAULT_TROLL_MESSAGES,
    });
    expect(afterComplete.deadlineAlerts).toHaveLength(0);
  });

  it('suppresses popup events when AlertMode is silent, and sanitizes persisted settings safely', () => {
    let state = createEmptyTrackerState();
    state = addLocalJob(
      state,
      {
        id: 'silent-job',
        title: 'Đọc tài liệu',
        description: '',
        deadlineMs: T0 + 1_000,
      },
      T0,
    );

    const silentEval = evaluateAlertsAt(state, {
      nowMs: T0 + 2_000,
      alertMode: 'silent',
      trollMessages: DEFAULT_TROLL_MESSAGES,
    });
    expect(silentEval.deadlineAlerts).toHaveLength(0);
    expect(silentEval.preDeadlineCues).toHaveLength(0);

    const defaults = createDefaultSettings();
    const sanitized = sanitizeAppSettings({
      opacity: 0.05, // below minimum -> clamped to 0.35
      syncIntervalSec: 5, // below minimum -> clamped to 30
      snoozeMinutes: 999, // above max -> clamped to 120
      alertMode: 'invalid-mode',
      trollMessages: ['  Câu troll số 1  ', ''],
    });

    expect(sanitized.opacity).toBe(0.35);
    expect(sanitized.syncIntervalSec).toBe(30);
    expect(sanitized.snoozeMinutes).toBe(120);
    expect(sanitized.alertMode).toBe(defaults.alertMode);
    expect(sanitized.trollMessages).toEqual(['Câu troll số 1']);
  });
});
