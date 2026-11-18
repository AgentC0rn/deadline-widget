import type {
  AlertMode,
  DeadlineAlertEvent,
} from './deadlineTracker';
import type { PersistedAppState } from './settings';

export type WidgetViewMode = 'mini-pill' | 'checklist-panel';

export interface FetchSheetCsvResult {
  ok: boolean;
  csvText?: string;
  error?: string;
}

export interface PickAudioFileResult {
  canceled: boolean;
  dataUrl?: string;
  fileName?: string;
  error?: string;
}

export type AlertWindowAction =
  | { type: 'complete'; jobId: string }
  | { type: 'snooze'; jobId: string }
  | { type: 'dismiss'; jobId: string };

export type TrayCommand =
  | { type: 'set-alert-mode'; alertMode: AlertMode }
  | { type: 'sync-now' }
  | { type: 'test-alert' };

export interface DeadlineDesktopBridge {
  loadPersistedState: () => Promise<PersistedAppState>;
  savePersistedState: (state: PersistedAppState) => Promise<void>;
  setWidgetViewMode: (mode: WidgetViewMode) => Promise<void>;
  fetchSheetCsv: (csvUrl: string) => Promise<FetchSheetCsvResult>;
  pickCustomAudioFile: () => Promise<PickAudioFileResult>;
  showDeadlineAlerts: (alerts: DeadlineAlertEvent[]) => Promise<void>;
  getPendingAlerts: () => Promise<DeadlineAlertEvent[]>;
  sendAlertAction: (action: AlertWindowAction) => Promise<void>;
  onAlertsUpdated: (listener: (alerts: DeadlineAlertEvent[]) => void) => () => void;
  onAlertAction: (listener: (action: AlertWindowAction) => void) => () => void;
  onTrayCommand: (listener: (command: TrayCommand) => void) => () => void;
  onWindowBlurred: (listener: () => void) => () => void;
  hideWidgetToTray: () => Promise<void>;
}
