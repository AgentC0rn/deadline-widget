import type { SheetJobInput } from './sourceSheetSync';

export type JobKind = 'local' | 'sheet';

export type UrgencyTier = 'normal' | 'warning' | 'critical' | 'overdue';

export type AlertMode = 'troll' | 'serious' | 'silent';

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  description: string;
  deadlineMs: number;
  completed: boolean;
  completedAtMs: number | null;
  firstSeenAtMs: number;
  snoozeUntilMs: number | null;
  criticalCueFired: boolean;
  deadlineAlertFired: boolean;
}

export interface JobView extends Job {
  remainingMs: number;
  countdownText: string;
  urgency: UrgencyTier;
  isOverdue: boolean;
}

export interface ChecklistSnapshot {
  miniPillJob: JobView | null;
  incompleteCount: number;
  incompleteJobs: JobView[];
  completedJobs: JobView[];
}

export interface TrackerState {
  jobs: Job[];
  completedSheetRecords?: Record<string, number>;
}

export interface LocalJobInput {
  id?: string;
  title: string;
  description: string;
  deadlineMs: number;
}

export interface LocalJobPatch {
  title: string;
  description: string;
  deadlineMs: number;
}

export interface PreDeadlineCueEvent {
  jobId: string;
  title: string;
  remainingMs: number;
}

export interface DeadlineAlertEvent {
  jobId: string;
  title: string;
  description: string;
  deadlineMs: number;
  alertMode: 'troll' | 'serious';
  trollMessage?: string;
}

export interface EvaluateAlertsOptions {
  nowMs: number;
  alertMode: AlertMode;
  trollMessages: string[];
  randomIndex?: number;
}

export interface EvaluateAlertsResult {
  state: TrackerState;
  preDeadlineCues: PreDeadlineCueEvent[];
  deadlineAlerts: DeadlineAlertEvent[];
}

const WARNING_THRESHOLD_MS = 60 * 60 * 1000;
const CRITICAL_THRESHOLD_MS = 15 * 60 * 1000;
export const HISTORICAL_OVERDUE_GRACE_MS = 15 * 60 * 1000;

export function createEmptyTrackerState(): TrackerState {
  return { jobs: [], completedSheetRecords: {} };
}

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatCountdown(remainingMs: number): string {
  const isOverdue = remainingMs <= 0;
  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const hms = `${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}`;
  const body = days > 0 ? `${days}d ${hms}` : hms;
  return isOverdue && totalSeconds > 0 ? `-${body}` : isOverdue ? '00:00:00' : body;
}

export function computeUrgency(remainingMs: number): UrgencyTier {
  if (remainingMs <= 0) return 'overdue';
  if (remainingMs <= CRITICAL_THRESHOLD_MS) return 'critical';
  if (remainingMs <= WARNING_THRESHOLD_MS) return 'warning';
  return 'normal';
}

export function addLocalJob(
  state: TrackerState,
  input: LocalJobInput,
  nowMs: number,
): TrackerState {
  const trimmedTitle = input.title.trim();
  if (!trimmedTitle) return state;

  let seq = state.jobs.length + 1;
  let id = input.id ?? `local-${nowMs}-${seq}`;
  const existingIds = new Set(state.jobs.map((j) => j.id));
  while (!input.id && existingIds.has(id)) {
    seq += 1;
    id = `local-${nowMs}-${seq}`;
  }

  const newJob: Job = {
    id,
    kind: 'local',
    title: trimmedTitle,
    description: input.description.trim(),
    deadlineMs: input.deadlineMs,
    completed: false,
    completedAtMs: null,
    firstSeenAtMs: nowMs,
    snoozeUntilMs: null,
    criticalCueFired: false,
    deadlineAlertFired: false,
  };

  return {
    ...state,
    jobs: [...state.jobs, newJob],
  };
}

export function updateLocalJob(
  state: TrackerState,
  jobId: string,
  patch: LocalJobPatch,
  nowMs: number,
): TrackerState {
  return {
    ...state,
    jobs: state.jobs.map((job) => {
      if (job.id !== jobId || job.kind !== 'local') return job;
      const deadlineMovedFuture = patch.deadlineMs > nowMs && patch.deadlineMs !== job.deadlineMs;
      return {
        ...job,
        title: patch.title.trim() || job.title,
        description: patch.description.trim(),
        deadlineMs: patch.deadlineMs,
        snoozeUntilMs: deadlineMovedFuture ? null : job.snoozeUntilMs,
        criticalCueFired:
          patch.deadlineMs > nowMs + CRITICAL_THRESHOLD_MS ? false : job.criticalCueFired,
        deadlineAlertFired: deadlineMovedFuture ? false : job.deadlineAlertFired,
      };
    }),
  };
}

export function deleteLocalJob(state: TrackerState, jobId: string): TrackerState {
  return {
    ...state,
    jobs: state.jobs.filter((job) => !(job.id === jobId && job.kind === 'local')),
  };
}

export function toggleJobCompletion(
  state: TrackerState,
  jobId: string,
  nowMs: number,
): TrackerState {
  const nextSheetRecords: Record<string, number> = {
    ...(state.completedSheetRecords ?? {}),
  };

  const nextJobs = state.jobs.map((job) => {
    if (job.id !== jobId) return job;
    const nextCompleted = !job.completed;
    if (job.kind === 'sheet') {
      if (nextCompleted) {
        nextSheetRecords[job.id] = nowMs;
      } else {
        delete nextSheetRecords[job.id];
      }
    }
    return {
      ...job,
      completed: nextCompleted,
      completedAtMs: nextCompleted ? nowMs : null,
      snoozeUntilMs: nextCompleted ? null : job.snoozeUntilMs,
    };
  });

  return {
    ...state,
    jobs: nextJobs,
    completedSheetRecords: nextSheetRecords,
  };
}

export function getChecklistSnapshot(
  state: TrackerState,
  nowMs: number,
): ChecklistSnapshot {
  const views: JobView[] = state.jobs.map((job) => {
    const remainingMs = job.deadlineMs - nowMs;
    const isOverdue = remainingMs <= 0;
    return {
      ...job,
      remainingMs,
      countdownText: formatCountdown(remainingMs),
      urgency: computeUrgency(remainingMs),
      isOverdue,
    };
  });

  const incompleteJobs = views
    .filter((job) => !job.completed)
    .sort((a, b) => a.deadlineMs - b.deadlineMs || a.title.localeCompare(b.title, 'vi'));

  const completedJobs = views
    .filter((job) => job.completed)
    .sort((a, b) => (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0));

  return {
    miniPillJob: incompleteJobs[0] ?? null,
    incompleteCount: incompleteJobs.length,
    incompleteJobs,
    completedJobs,
  };
}

export function reconcileSheetJobs(
  state: TrackerState,
  sheetInputs: SheetJobInput[],
  nowMs: number,
): TrackerState {
  const existingSheetJobs = new Map<string, Job>();
  const localJobs: Job[] = [];
  const nextSheetRecords: Record<string, number> = {
    ...(state.completedSheetRecords ?? {}),
  };

  for (const job of state.jobs) {
    if (job.kind === 'sheet') {
      existingSheetJobs.set(job.id, job);
      if (job.completed) {
        nextSheetRecords[job.id] = job.completedAtMs ?? nowMs;
      }
    } else {
      localJobs.push(job);
    }
  }

  const nextSheetJobs: Job[] = sheetInputs.map((input) => {
    const existing = existingSheetJobs.get(input.id);
    if (existing) {
      const deadlineExtendedToFuture =
        !existing.completed &&
        input.deadlineMs > nowMs &&
        input.deadlineMs !== existing.deadlineMs;
      return {
        ...existing,
        title: input.title,
        description: input.description,
        deadlineMs: input.deadlineMs,
        snoozeUntilMs: deadlineExtendedToFuture ? null : existing.snoozeUntilMs,
        criticalCueFired:
          deadlineExtendedToFuture && input.deadlineMs > nowMs + CRITICAL_THRESHOLD_MS
            ? false
            : existing.criticalCueFired,
        deadlineAlertFired: deadlineExtendedToFuture ? false : existing.deadlineAlertFired,
      };
    }

    const rememberedCompletedAt = nextSheetRecords[input.id] ?? null;
    const isRememberedCompleted = rememberedCompletedAt !== null;
    const isHistoricalOverdue = input.deadlineMs < nowMs - HISTORICAL_OVERDUE_GRACE_MS;

    return {
      id: input.id,
      kind: 'sheet',
      title: input.title,
      description: input.description,
      deadlineMs: input.deadlineMs,
      completed: isRememberedCompleted,
      completedAtMs: rememberedCompletedAt,
      firstSeenAtMs: nowMs,
      snoozeUntilMs: null,
      criticalCueFired: isRememberedCompleted || isHistoricalOverdue || input.deadlineMs <= nowMs,
      deadlineAlertFired: isRememberedCompleted || isHistoricalOverdue,
    };
  });

  return {
    jobs: [...localJobs, ...nextSheetJobs],
    completedSheetRecords: nextSheetRecords,
  };
}

export function isHistoricalSheetOverdue(
  job: Pick<Job, 'kind' | 'completed' | 'deadlineMs' | 'firstSeenAtMs'>,
  minOverdueMs = HISTORICAL_OVERDUE_GRACE_MS,
): boolean {
  return (
    job.kind === 'sheet' &&
    !job.completed &&
    job.firstSeenAtMs - job.deadlineMs >= minOverdueMs
  );
}

export function completeHistoricalOverdueJobs(
  state: TrackerState,
  nowMs: number,
  minOverdueMs = HISTORICAL_OVERDUE_GRACE_MS,
): TrackerState {
  const nextSheetRecords: Record<string, number> = {
    ...(state.completedSheetRecords ?? {}),
  };

  return {
    ...state,
    jobs: state.jobs.map((job) => {
      if (isHistoricalSheetOverdue(job, minOverdueMs)) {
        nextSheetRecords[job.id] = nowMs;
        return {
          ...job,
          completed: true,
          completedAtMs: nowMs,
          snoozeUntilMs: null,
        };
      }
      return job;
    }),
    completedSheetRecords: nextSheetRecords,
  };
}

export function snoozeJobAlert(
  state: TrackerState,
  jobId: string,
  snoozeMinutes: number,
  nowMs: number,
): TrackerState {
  const safeMinutes = Math.max(1, snoozeMinutes);
  return {
    ...state,
    jobs: state.jobs.map((job) => {
      if (job.id !== jobId || job.completed) return job;
      return {
        ...job,
        snoozeUntilMs: nowMs + safeMinutes * 60_000,
        deadlineAlertFired: true,
      };
    }),
  };
}

function pickTrollMessage(messages: string[], randomIndex?: number): string {
  const fallback = 'Deadline về 00:00:00 rồi bạn ơi, xử lý ngay kẻo trễ! 🚨';
  if (messages.length === 0) return fallback;
  const idx =
    typeof randomIndex === 'number'
      ? Math.abs(randomIndex) % messages.length
      : Math.floor(Math.random() * messages.length);
  return messages[idx] ?? fallback;
}

export function countHistoricalOverdueJobs(
  incompleteJobs: JobView[],
  minOverdueMs = HISTORICAL_OVERDUE_GRACE_MS,
): number {
  return incompleteJobs.filter((job) => isHistoricalSheetOverdue(job, minOverdueMs)).length;
}

function buildDeadlineAlertEvent(
  job: Job,
  alertMode: 'troll' | 'serious',
  trollMessages: string[],
  randomIndex?: number,
): DeadlineAlertEvent {
  return {
    jobId: job.id,
    title: job.title,
    description: job.description,
    deadlineMs: job.deadlineMs,
    alertMode,
    ...(alertMode === 'troll'
      ? { trollMessage: pickTrollMessage(trollMessages, randomIndex) }
      : {}),
  };
}

export function evaluateAlertsAt(
  state: TrackerState,
  options: EvaluateAlertsOptions,
): EvaluateAlertsResult {
  const { nowMs, alertMode, trollMessages, randomIndex } = options;
  const preDeadlineCues: PreDeadlineCueEvent[] = [];
  const deadlineAlerts: DeadlineAlertEvent[] = [];
  let changed = false;

  const nextJobs = state.jobs.map((job) => {
    if (job.completed) return job;

    const remainingMs = job.deadlineMs - nowMs;

    if (job.snoozeUntilMs !== null) {
      if (nowMs < job.snoozeUntilMs) {
        return job;
      }
      changed = true;
      if (alertMode !== 'silent') {
        deadlineAlerts.push(
          buildDeadlineAlertEvent(job, alertMode, trollMessages, randomIndex),
        );
      }
      return {
        ...job,
        snoozeUntilMs: null,
        deadlineAlertFired: true,
        criticalCueFired: true,
      };
    }

    if (remainingMs <= 0 && !job.deadlineAlertFired) {
      changed = true;
      const wasHistoricalOnImport =
        job.deadlineMs < job.firstSeenAtMs - HISTORICAL_OVERDUE_GRACE_MS;

      if (!wasHistoricalOnImport && alertMode !== 'silent') {
        deadlineAlerts.push(
          buildDeadlineAlertEvent(job, alertMode, trollMessages, randomIndex),
        );
      }

      return {
        ...job,
        criticalCueFired: true,
        deadlineAlertFired: true,
      };
    }

    if (
      remainingMs > 0 &&
      remainingMs <= CRITICAL_THRESHOLD_MS &&
      !job.criticalCueFired
    ) {
      changed = true;
      if (alertMode !== 'silent') {
        preDeadlineCues.push({
          jobId: job.id,
          title: job.title,
          remainingMs,
        });
      }
      return {
        ...job,
        criticalCueFired: true,
      };
    }

    return job;
  });

  return {
    state: changed ? { ...state, jobs: nextJobs } : state,
    preDeadlineCues,
    deadlineAlerts,
  };
}

