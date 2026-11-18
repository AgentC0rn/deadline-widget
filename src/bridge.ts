import type { DeadlineDesktopBridge } from './core/ipcContract';
import { sanitizePersistedState } from './core/settings';

declare global {
  interface Window {
    deadlineBridge?: DeadlineDesktopBridge;
  }
}

const noopBridge: DeadlineDesktopBridge = {
  async loadPersistedState() {
    return sanitizePersistedState(null, Date.now());
  },
  async savePersistedState() {},
  async setWidgetViewMode() {},
  async fetchSheetCsv() {
    return { ok: false, error: 'Chỉ hoạt động trong ứng dụng Desktop Electron.' };
  },
  async pickCustomAudioFile() {
    return { canceled: true };
  },
  async showDeadlineAlerts() {},
  async getPendingAlerts() {
    return [];
  },
  async sendAlertAction() {},
  onAlertsUpdated() {
    return () => {};
  },
  onAlertAction() {
    return () => {};
  },
  onTrayCommand() {
    return () => {};
  },
  onWindowBlurred() {
    return () => {};
  },
  async hideWidgetToTray() {},
};

export function getDesktopBridge(): DeadlineDesktopBridge {
  return window.deadlineBridge ?? noopBridge;
}
