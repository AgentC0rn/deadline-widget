import { describe, expect, it } from 'vitest';
import {
  buildGoogleSheetCsvUrl,
  parseSourceSheetCsv,
} from '../src/core/sourceSheetSync';
import {
  addLocalJob,
  completeHistoricalOverdueJobs,
  createEmptyTrackerState,
  getChecklistSnapshot,
  reconcileSheetJobs,
  toggleJobCompletion,
} from '../src/core/deadlineTracker';

describe('SourceSheetSync & Sheet Job reconciliation — Ticket 02', () => {
  it('converts Google Sheet sharing/edit URLs (with/without gid) and direct CSV URLs', () => {
    expect(
      buildGoogleSheetCsvUrl(
        'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit?usp=sharing',
      ),
    ).toBe(
      'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/export?format=csv',
    );

    expect(
      buildGoogleSheetCsvUrl(
        'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/edit#gid=987654321',
      ),
    ).toBe(
      'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz123456/export?format=csv&gid=987654321',
    );

    expect(
      buildGoogleSheetCsvUrl(
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vTest/pub?output=csv',
      ),
    ).toBe('https://docs.google.com/spreadsheets/d/e/2PACX-1vTest/pub?output=csv');

    expect(buildGoogleSheetCsvUrl('https://example.com/not-a-sheet')).toBeNull();
  });

  it('parses quoted multiline CSV, auto-detects Vietnamese headers, and parses DD/MM/YYYY HH:mm, HH:mm DD/MM/YYYY, YYYY-MM-DD HH:mm & date-only', () => {
    const csv = [
      'STT,Tên job,Mô tả,Deadline',
      '1,"Thiết kế KV 20/11","Banner dọc + ngang,\nđổi tone màu cam",18/11/2026 16:30',
      '2,Gửi bảng báo giá,Khách hàng VIP,19/11/2026',
      '3,Review video TikTok,Bản nháp lần 2,2026-11-20 09:15',
      '4,Họp nội bộ team,Phòng 202,14:45 21/11/2026',
    ].join('\n');

    const result = parseSourceSheetCsv(csv, {
      defaultDeadlineTime: '17:30',
    });

    expect(result.detectedColumns).toEqual({
      idColumn: null,
      titleColumn: 'Tên job',
      descriptionColumn: 'Mô tả',
      deadlineColumn: 'Deadline',
    });
    expect(result.jobs).toHaveLength(4);

    const job0 = result.jobs[0];
    const job1 = result.jobs[1];
    const job2 = result.jobs[2];
    const job3 = result.jobs[3];
    if (!job0 || !job1 || !job2 || !job3) {
      throw new Error('Expected 4 parsed jobs');
    }

    expect(job0.title).toBe('Thiết kế KV 20/11');
    expect(job0.description).toBe('Banner dọc + ngang,\nđổi tone màu cam');
    const firstDate = new Date(job0.deadlineMs);
    expect(firstDate.getFullYear()).toBe(2026);
    expect(firstDate.getMonth()).toBe(10);
    expect(firstDate.getDate()).toBe(18);
    expect(firstDate.getHours()).toBe(16);
    expect(firstDate.getMinutes()).toBe(30);

    // Date-only cell gets defaultDeadlineTime 17:30
    const secondDate = new Date(job1.deadlineMs);
    expect(secondDate.getDate()).toBe(19);
    expect(secondDate.getHours()).toBe(17);
    expect(secondDate.getMinutes()).toBe(30);

    // ISO-like YYYY-MM-DD HH:mm
    const thirdDate = new Date(job2.deadlineMs);
    expect(thirdDate.getDate()).toBe(20);
    expect(thirdDate.getHours()).toBe(9);
    expect(thirdDate.getMinutes()).toBe(15);

    // HH:mm DD/MM/YYYY
    const fourthDate = new Date(job3.deadlineMs);
    expect(fourthDate.getDate()).toBe(21);
    expect(fourthDate.getHours()).toBe(14);
    expect(fourthDate.getMinutes()).toBe(45);
  });

  it('supports manual column mapping override by header name, column letter, or 1-based column number', () => {
    const csv = [
      'Col1,Col2,Col3,Col4',
      'J-101,Dựng landing page,Bản mobile trước,21/11/2026 14:00',
    ].join('\n');

    const result = parseSourceSheetCsv(csv, {
      defaultDeadlineTime: '18:00',
      columnOverrides: {
        idColumn: 'A',
        titleColumn: '2',
        descriptionColumn: 'Col3',
        deadlineColumn: 'D',
      },
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.id).toBe('sheet:id:j-101');
    expect(result.jobs[0]?.title).toBe('Dựng landing page');
    expect(result.jobs[0]?.description).toBe('Bản mobile trước');
  });

  it('preserves completed Sheet Job state across row insertions, disconnects/reconnects, and bulk-completes only historical Sheet Overdue items', () => {
    const nowMs = new Date(2026, 10, 18, 14, 0, 0).getTime();
    let state = createEmptyTrackerState();

    // Add a live Local Job created BEFORE its deadline that later goes overdue (must NOT be swept by historical bulk-complete)
    const createdEarly = nowMs - 2 * 3_600_000;
    state = addLocalJob(
      state,
      {
        id: 'local-live-overdue',
        title: 'Việc cá nhân đang trễ',
        description: 'Tạo lúc 12h, hạn 13h',
        deadlineMs: nowMs - 3_600_000,
      },
      createdEarly,
    );

    const initialCsv = [
      'Tên job,Mô tả,Deadline',
      'Viết content Facebook,Bài 1,18/11/2026 16:00',
      'Lên lịch đăng bài,Bài 2,18/11/2026 10:00',
    ].join('\n');

    const firstBatch = parseSourceSheetCsv(initialCsv, { defaultDeadlineTime: '17:30' });
    const firstContentJob = firstBatch.jobs[0];
    if (!firstContentJob) throw new Error('Expected first job');

    state = reconcileSheetJobs(state, firstBatch.jobs, nowMs);
    state = toggleJobCompletion(state, firstContentJob.id, nowMs + 1_000);

    // Simulate temporarily clearing Sheet URL -> empty reconcile -> then reconnecting updated CSV
    state = reconcileSheetJobs(state, [], nowMs + 10_000);

    const updatedCsv = [
      'Tên job,Mô tả,Deadline',
      'Job khẩn cấp mới chèn,Ưu tiên số 1,18/11/2026 15:00',
      'Viết content Facebook,Bài 1 (đã bổ sung hashtag),18/11/2026 16:00',
      'Lên lịch đăng bài,Bài 2,18/11/2026 10:00',
    ].join('\n');

    const secondBatch = parseSourceSheetCsv(updatedCsv, { defaultDeadlineTime: '17:30' });
    state = reconcileSheetJobs(state, secondBatch.jobs, nowMs + 60_000);

    const snapshot = getChecklistSnapshot(state, nowMs + 60_000);
    expect(snapshot.completedJobs).toHaveLength(1);
    expect(snapshot.completedJobs[0]?.title).toBe('Viết content Facebook');
    expect(snapshot.completedJobs[0]?.description).toBe('Bài 1 (đã bổ sung hashtag)');

    // Bulk complete historical Sheet Overdue jobs completes "Lên lịch đăng bài" while leaving Local Job untouched
    state = completeHistoricalOverdueJobs(state, nowMs + 60_000);
    const afterBulk = getChecklistSnapshot(state, nowMs + 60_000);
    expect(afterBulk.completedJobs.map((j) => j.title)).toContain('Lên lịch đăng bài');
    expect(afterBulk.incompleteJobs.map((j) => j.title)).toEqual([
      'Việc cá nhân đang trễ',
      'Job khẩn cấp mới chèn',
    ]);
  });
});
