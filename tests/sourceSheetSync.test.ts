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
  it('converts Google Sheet sharing/edit URLs (with and without gid) to direct CSV export URLs', () => {
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
      buildGoogleSheetCsvUrl('https://example.com/not-a-sheet'),
    ).toBeNull();
  });

  it('parses quoted multiline CSV, auto-detects Vietnamese headers, and parses DD/MM/YYYY HH:mm + date-only default time', () => {
    const csv = [
      'STT,Tên job,Mô tả,Deadline',
      '1,"Thiết kế KV 20/11","Banner dọc + ngang,\nđổi tone màu cam",18/11/2026 16:30',
      '2,Gửi bảng báo giá,Khách hàng VIP,19/11/2026',
      '3,Review video TikTok,Bản nháp lần 2,2026-11-20 09:15',
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
    expect(result.jobs).toHaveLength(3);

    expect(result.jobs[0]?.title).toBe('Thiết kế KV 20/11');
    expect(result.jobs[0]?.description).toBe('Banner dọc + ngang,\nđổi tone màu cam');
    const firstDate = new Date(result.jobs[0]!.deadlineMs);
    expect(firstDate.getFullYear()).toBe(2026);
    expect(firstDate.getMonth()).toBe(10); // November (0-indexed)
    expect(firstDate.getDate()).toBe(18);
    expect(firstDate.getHours()).toBe(16);
    expect(firstDate.getMinutes()).toBe(30);

    // Date-only cell gets defaultDeadlineTime 17:30
    const secondDate = new Date(result.jobs[1]!.deadlineMs);
    expect(secondDate.getDate()).toBe(19);
    expect(secondDate.getHours()).toBe(17);
    expect(secondDate.getMinutes()).toBe(30);

    // ISO-like YYYY-MM-DD HH:mm
    const thirdDate = new Date(result.jobs[2]!.deadlineMs);
    expect(thirdDate.getDate()).toBe(20);
    expect(thirdDate.getHours()).toBe(9);
    expect(thirdDate.getMinutes()).toBe(15);
  });

  it('supports manual column mapping override when headers use custom names', () => {
    const csv = [
      'Code,Hạng mục,Ghi chú thêm,Chốt sổ',
      'J-101,Dựng landing page,Bản mobile trước,21/11/2026 14:00',
    ].join('\n');

    const result = parseSourceSheetCsv(csv, {
      defaultDeadlineTime: '18:00',
      columnOverrides: {
        idColumn: 'Code',
        titleColumn: 'Hạng mục',
        descriptionColumn: 'Ghi chú thêm',
        deadlineColumn: 'Chốt sổ',
      },
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.id).toBe('sheet:id:j-101');
    expect(result.jobs[0]?.title).toBe('Dựng landing page');
    expect(result.jobs[0]?.description).toBe('Bản mobile trước');
  });

  it('preserves completed Sheet Job state when rows are inserted at top or descriptions change, and keeps Local Jobs intact', () => {
    const nowMs = new Date(2026, 10, 18, 14, 0, 0).getTime();
    let state = createEmptyTrackerState();
    state = addLocalJob(
      state,
      {
        id: 'local-keep',
        title: 'Việc cá nhân',
        description: 'Mua quà sinh nhật',
        deadlineMs: nowMs + 3_600_000,
      },
      nowMs,
    );

    const initialCsv = [
      'Tên job,Mô tả,Deadline',
      'Viết content Facebook,Bài 1,18/11/2026 16:00',
      'Lên lịch đăng bài,Bài 2,18/11/2026 10:00',
    ].join('\n');

    const firstBatch = parseSourceSheetCsv(initialCsv, { defaultDeadlineTime: '17:30' });
    state = reconcileSheetJobs(state, firstBatch.jobs, nowMs);

    // User ticks off "Viết content Facebook"
    const contentJobId = firstBatch.jobs[0]!.id;
    state = toggleJobCompletion(state, contentJobId, nowMs + 1_000);

    // Manager inserts a new urgent job at row 1 and edits description of "Viết content Facebook"
    const updatedCsv = [
      'Tên job,Mô tả,Deadline',
      'Job khẩn cấp mới chèn,Ưu tiên số 1,18/11/2026 15:00',
      'Viết content Facebook,Bài 1 (đã bổ sung hashtag),18/11/2026 16:00',
      'Lên lịch đăng bài,Bài 2,18/11/2026 10:00',
    ].join('\n');

    const secondBatch = parseSourceSheetCsv(updatedCsv, { defaultDeadlineTime: '17:30' });
    state = reconcileSheetJobs(state, secondBatch.jobs, nowMs + 60_000);

    const snapshot = getChecklistSnapshot(state, nowMs + 60_000);
    // Completed job stays completed with updated description!
    expect(snapshot.completedJobs).toHaveLength(1);
    expect(snapshot.completedJobs[0]?.title).toBe('Viết content Facebook');
    expect(snapshot.completedJobs[0]?.description).toBe('Bài 1 (đã bổ sung hashtag)');

    // Local job + 2 incomplete sheet jobs remain active
    expect(snapshot.incompleteCount).toBe(3);

    // Bulk complete old Overdue jobs (> 15m overdue) marks "Lên lịch đăng bài" (10:00 vs 14:01) completed
    state = completeHistoricalOverdueJobs(state, nowMs + 60_000);
    const afterBulk = getChecklistSnapshot(state, nowMs + 60_000);
    expect(afterBulk.completedJobs.map((j) => j.title)).toContain('Lên lịch đăng bài');
    expect(afterBulk.incompleteJobs.map((j) => j.title)).toEqual([
      'Job khẩn cấp mới chèn',
      'Việc cá nhân',
    ]);
  });
});
