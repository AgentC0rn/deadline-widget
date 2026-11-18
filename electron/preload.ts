import { contextBridge, ipcRenderer } from 'electron';
import type {
  AlertWindowAction,
  DeadlineDesktopBridge,
  FetchSheetCsvResult,
  PickAudioFileResult,
  TrayCommand,
  WidgetViewMode,
} from '../src/core/ipcContract';
import type { DeadlineAlertEvent } from '../src/core/deadlineTracker';
import type { PersistedAppState } from '../src/core/settings';

const bridge: DeadlineDesktopBridge = {
  loadPersistedState: (): Promise<PersistedAppState> =>
    ipcRenderer.invoke('state:load'),

  savePersistedState: (state: PersistedAppState): Promise<void> =>
    ipcRenderer.invoke('state:save', state),

  setWidgetViewMode: (mode: WidgetViewMode): Promise<void> =>
    ipcRenderer.invoke('window:set-view-mode', mode),

  fetchSheetCsv: (csvUrl: string): Promise<FetchSheetCsvResult> =>
    ipcRenderer.invoke('sheet:fetch-csv', csvUrl),

  pickCustomAudioFile: (): Promise<PickAudioFileResult> =>
    ipcRenderer.invoke('audio:pick-file'),

  showDeadlineAlerts: (alerts: DeadlineAlertEvent[]): Promise<void> =>
    ipcRenderer.invoke('alerts:show', alerts),

  getPendingAlerts: (): Promise<DeadlineAlertEvent[]> =>
    ipcRenderer.invoke('alerts:get-pending'),

  sendAlertAction: (action: AlertWindowAction): Promise<void> =>
    ipcRenderer.invoke('alerts:action', action),

  onAlertsUpdated: (listener: (alerts: DeadlineAlertEvent[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, alerts: DeadlineAlertEvent[]) => {
      listener(alerts);
    };
    ipcRenderer.on('alerts:updated', wrapped);
    return () => {
      ipcRenderer.removeListener('alerts:updated', wrapped);
    };
  },

  onAlertAction: (listener: (action: AlertWindowAction) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, action: AlertWindowAction) => {
      listener(action);
    };
    ipcRenderer.on('alerts:action-forwarded', wrapped);
    return () => {
      ipcRenderer.removeListener('alerts:action-forwarded', wrapped);
    };
  },

  onTrayCommand: (listener: (command: TrayCommand) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: TrayCommand) => {
      listener(command);
    };
    ipcRenderer.on('tray:command', wrapped);
    return () => {
      ipcRenderer.removeListener('tray:command', wrapped);
    };
  },

  onWindowBlurred: (listener: () => void) => {
    const wrapped = () => {
      listener();
    };
    ipcRenderer.on('window:blurred', wrapped);
    return () => {
      ipcRenderer.removeListener('window:blurred', wrapped);
    };
  },

  hideWidgetToTray: (): Promise<void> => ipcRenderer.invoke('window:hide-to-tray'),
};

contextBridge.exposeInMainWorld('deadlineBridge', bridge);
