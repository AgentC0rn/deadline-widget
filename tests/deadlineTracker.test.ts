import { describe, expect, it } from 'vitest';
import {
  addLocalJob,
  createEmptyTrackerState,
  deleteLocalJob,
  getChecklistSnapshot,
  toggleJobCompletion,
  updateLocalJob,
} from '../src/core/deadlineTracker';

describe('DeadlineTracker — Ticket 01: Local Job CRUD, sorting, urgency & countdown', () => {
  const BASE_NOW = Date.parse('2026-11-18T09:00:00.000Z');

  it('orders incomplete Local Jobs by earliest Deadline first, picks Mini Pill job, and separates completed jobs', () => {
    let state = createEmptyTrackerState();

    state = addLocalJob(
      state,
      {
        id: 'local-later',
        title: 'Gửi báo cáo tuần',
        description: 'Tổng hợp KPI phòng',
        deadlineMs: BASE_NOW + 2 * 60 * 60 * 1000, // +2h -> normal
      },
      BASE_NOW,
    );

    state = addLocalJob(
      state,
      {
        id: 'local-urgent',
        title: 'Duyệt banner chiến dịch',
        description: 'Gửi file PNG cho team Ads',
        deadlineMs: BASE_NOW + 10 * 60 * 1000, // +10m -> critical
      },
      BASE_NOW,
    );

    state = addLocalJob(
      state,
      {
        id: 'local-warning',
        title: 'Họp chốt kịch bản',
        description: 'Phòng họp tầng 3',
        deadlineMs: BASE_NOW + 45 * 60 * 1000, // +45m -> warning
      },
      BASE_NOW,
    );

    const snapshot = getChecklistSnapshot(state, BASE_NOW);
    expect(snapshot.incompleteCount).toBe(3);
    expect(snapshot.incompleteJobs.map((j) => j.id)).toEqual([
      'local-urgent',
      'local-warning',
      'local-later',
    ]);
    expect(snapshot.miniPillJob?.id).toBe('local-urgent');
    expect(snapshot.miniPillJob?.urgency).toBe('critical');
    expect(snapshot.miniPillJob?.countdownText).toBe('00:10:00');
    expect(snapshot.incompleteJobs[1]?.urgency).toBe('warning');
    expect(snapshot.incompleteJobs[2]?.urgency).toBe('normal');
    expect(snapshot.incompleteJobs[2]?.countdownText).toBe('02:00:00');

    // Completing the most urgent job promotes the next urgent job to Mini Pill
    state = toggleJobCompletion(state, 'local-urgent', BASE_NOW + 5_000);
    const afterComplete = getChecklistSnapshot(state, BASE_NOW + 5_000);
    expect(afterComplete.incompleteCount).toBe(2);
    expect(afterComplete.miniPillJob?.id).toBe('local-warning');
    expect(afterComplete.completedJobs.map((j) => j.id)).toEqual(['local-urgent']);
  });

  it('formats Overdue jobs with negative elapsed time and supports updating and deleting a Local Job', () => {
    let state = createEmptyTrackerState();
    state = addLocalJob(
      state,
      {
        id: 'local-1',
        title: 'Nộp hợp đồng',
        description: 'Bản scan có chữ ký',
        deadlineMs: BASE_NOW + 30 * 60 * 1000,
      },
      BASE_NOW,
    );

    // Advance 35 minutes -> 5 minutes and 12 seconds Overdue
    const overdueSnapshot = getChecklistSnapshot(state, BASE_NOW + (35 * 60 + 12) * 1000);
    expect(overdueSnapshot.miniPillJob?.isOverdue).toBe(true);
    expect(overdueSnapshot.miniPillJob?.urgency).toBe('overdue');
    expect(overdueSnapshot.miniPillJob?.countdownText).toBe('-00:05:12');

    // Update Local Job deadline further into the future
    state = updateLocalJob(
      state,
      'local-1',
      {
        title: 'Nộp hợp đồng (đã gia hạn)',
        description: 'Bản scan có chữ ký giám đốc',
        deadlineMs: BASE_NOW + 30 * 60 * 60 * 1000, // +1d 6h
      },
      BASE_NOW + 36 * 60 * 1000,
    );

    const updatedSnapshot = getChecklistSnapshot(state, BASE_NOW);
    expect(updatedSnapshot.miniPillJob?.title).toBe('Nộp hợp đồng (đã gia hạn)');
    expect(updatedSnapshot.miniPillJob?.isOverdue).toBe(false);
    expect(updatedSnapshot.miniPillJob?.countdownText).toBe('1d 06:00:00');

    // Delete Local Job
    state = deleteLocalJob(state, 'local-1');
    const emptySnapshot = getChecklistSnapshot(state, BASE_NOW);
    expect(emptySnapshot.incompleteCount).toBe(0);
    expect(emptySnapshot.miniPillJob).toBeNull();
  });
});
