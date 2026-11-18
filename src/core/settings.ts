import {
  type AlertMode,
  type Job,
  type TrackerState,
  createEmptyTrackerState,
} from './deadlineTracker';
import type { ColumnMapping } from './sourceSheetSync';

export type BuiltInSoundId =
  | 'sad-trombone'
  | 'ba-dum-tss'
  | 'siren'
  | 'chime'
  | 'retro-fail'
  | 'custom';

export interface WindowBounds {
  x: number;
  y: number;
}

export interface AppSettings {
  sourceSheetUrl: string;
  columnOverrides: ColumnMapping;
  syncIntervalSec: number;
  defaultDeadlineTime: string;
  alertMode: AlertMode;
  soundEnabled: boolean;
  soundId: BuiltInSoundId;
  customSoundDataUrl: string | null;
  customSoundFileName: string | null;
  soundVolume: number;
  snoozeMinutes: number;
  opacity: number;
  pinnedExpanded: boolean;
  trollMessages: string[];
  windowPosition: WindowBounds | null;
}

export interface PersistedAppState {
  version: 1;
  settings: AppSettings;
  tracker: TrackerState;
  seededDemoJobs: boolean;
}

export const DEFAULT_TROLL_MESSAGES: string[] = [
  'Deadline tới chân rồi còn ngồi thẫn thờ đó à?! 🏃‍♂️💨',
  'Sếp đang gõ phím "Em ơi job này sao rồi..." kìa! 👀',
  'Đồng hồ về 00:00:00 rồi bạn hiền ơi, tỉnh ngủ làm lẹ đi! ☕🔥',
  'Hứa làm 5 phút xong mà giờ trôi lố hạn luôn rồi đó nha! 🤡',
  'Cứu job này trước đi rồi lướt mạng tiếp cũng chưa muộn! 🚨🐸',
  'Ting ting! Quà tặng cuộc sống gửi tới bạn một chiếc Overdue đỏ chót! 🎁💥',
];

const VALID_ALERT_MODES: readonly AlertMode[] = ['troll', 'serious', 'silent'];
const VALID_SOUND_IDS: readonly BuiltInSoundId[] = [
  'sad-trombone',
  'ba-dum-tss',
  'siren',
  'chime',
  'retro-fail',
  'custom',
];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createDefaultSettings(): AppSettings {
  return {
    sourceSheetUrl: '',
    columnOverrides: {
      idColumn: null,
      titleColumn: null,
      descriptionColumn: null,
      deadlineColumn: null,
    },
    syncIntervalSec: 60,
    defaultDeadlineTime: '17:30',
    alertMode: 'troll',
    soundEnabled: true,
    soundId: 'sad-trombone',
    customSoundDataUrl: null,
    customSoundFileName: null,
    soundVolume: 0.8,
    snoozeMinutes: 10,
    opacity: 0.94,
    pinnedExpanded: true,
    trollMessages: [...DEFAULT_TROLL_MESSAGES],
    windowPosition: null,
  };
}

export function sanitizeAppSettings(raw: unknown): AppSettings {
  const defaults = createDefaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  const obj = raw as Record<string, unknown>;
  const rawOverrides =
    obj.columnOverrides && typeof obj.columnOverrides === 'object'
      ? (obj.columnOverrides as Record<string, unknown>)
      : {};

  const alertMode = VALID_ALERT_MODES.includes(obj.alertMode as AlertMode)
    ? (obj.alertMode as AlertMode)
    : defaults.alertMode;

  const soundId = VALID_SOUND_IDS.includes(obj.soundId as BuiltInSoundId)
    ? (obj.soundId as BuiltInSoundId)
    : defaults.soundId;

  const defaultDeadlineTime =
    typeof obj.defaultDeadlineTime === 'string' &&
    /^\d{1,2}:\d{2}$/.test(obj.defaultDeadlineTime.trim())
      ? obj.defaultDeadlineTime.trim()
      : defaults.defaultDeadlineTime;

  let trollMessages = defaults.trollMessages;
  if (Array.isArray(obj.trollMessages)) {
    const cleaned = obj.trollMessages
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (cleaned.length > 0) {
      trollMessages = cleaned;
    }
  }

  let windowPosition: WindowBounds | null = null;
  if (obj.windowPosition && typeof obj.windowPosition === 'object') {
    const pos = obj.windowPosition as Record<string, unknown>;
    if (
      typeof pos.x === 'number' &&
      Number.isFinite(pos.x) &&
      typeof pos.y === 'number' &&
      Number.isFinite(pos.y)
    ) {
      windowPosition = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
  }

  return {
    sourceSheetUrl: typeof obj.sourceSheetUrl === 'string' ? obj.sourceSheetUrl.trim() : '',
    columnOverrides: {
      idColumn: sanitizeNullableString(rawOverrides.idColumn),
      titleColumn: sanitizeNullableString(rawOverrides.titleColumn),
      descriptionColumn: sanitizeNullableString(rawOverrides.descriptionColumn),
      deadlineColumn: sanitizeNullableString(rawOverrides.deadlineColumn),
    },
    syncIntervalSec: Math.round(clampNumber(obj.syncIntervalSec, 30, 900, defaults.syncIntervalSec)),
    defaultDeadlineTime,
    alertMode,
    soundEnabled: typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : defaults.soundEnabled,
    soundId,
    customSoundDataUrl: sanitizeNullableString(obj.customSoundDataUrl),
    customSoundFileName: sanitizeNullableString(obj.customSoundFileName),
    soundVolume: clampNumber(obj.soundVolume, 0, 1, defaults.soundVolume),
    snoozeMinutes: Math.round(clampNumber(obj.snoozeMinutes, 1, 120, defaults.snoozeMinutes)),
    opacity: clampNumber(obj.opacity, 0.35, 1, defaults.opacity),
    pinnedExpanded:
      typeof obj.pinnedExpanded === 'boolean' ? obj.pinnedExpanded : defaults.pinnedExpanded,
    trollMessages,
    windowPosition,
  };
}

function sanitizeJob(raw: unknown): Job | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id.trim()) return null;
  if (obj.kind !== 'local' && obj.kind !== 'sheet') return null;
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;
  if (typeof obj.deadlineMs !== 'number' || !Number.isFinite(obj.deadlineMs)) return null;

  return {
    id: obj.id,
    kind: obj.kind,
    title: obj.title,
    description: typeof obj.description === 'string' ? obj.description : '',
    deadlineMs: obj.deadlineMs,
    completed: Boolean(obj.completed),
    completedAtMs:
      typeof obj.completedAtMs === 'number' && Number.isFinite(obj.completedAtMs)
        ? obj.completedAtMs
        : null,
    firstSeenAtMs:
      typeof obj.firstSeenAtMs === 'number' && Number.isFinite(obj.firstSeenAtMs)
        ? obj.firstSeenAtMs
        : Date.now(),
    snoozeUntilMs:
      typeof obj.snoozeUntilMs === 'number' && Number.isFinite(obj.snoozeUntilMs)
        ? obj.snoozeUntilMs
        : null,
    criticalCueFired: Boolean(obj.criticalCueFired),
    deadlineAlertFired: Boolean(obj.deadlineAlertFired),
  };
}

export function sanitizePersistedState(raw: unknown): PersistedAppState {
  if (!raw || typeof raw !== 'object') {
    return {
      version: 1,
      settings: createDefaultSettings(),
      tracker: createEmptyTrackerState(),
      seededDemoJobs: false,
    };
  }

  const obj = raw as Record<string, unknown>;
  const rawTracker =
    obj.tracker && typeof obj.tracker === 'object'
      ? (obj.tracker as Record<string, unknown>)
      : {};
  const rawJobs = Array.isArray(rawTracker.jobs) ? rawTracker.jobs : [];

  return {
    version: 1,
    settings: sanitizeAppSettings(obj.settings),
    tracker: {
      jobs: rawJobs.map(sanitizeJob).filter((j): j is Job => j !== null),
    },
    seededDemoJobs: Boolean(obj.seededDemoJobs),
  };
}
