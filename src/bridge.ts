import type { DeadlineDesktopBridge } from './core/ipcContract';
import { sanitizePersistedState } from './core/settings';

declare global {
  interface Window {
    deadlineBridge?: DeadlineDesktopBridge;
  }
}

const STORAGE_FALLBACK_KEY = 'deadline-widget-browser-fallback-v1';

const browserFallbackBridge: DeadlineDesktopBridge = {
  async loadPersistedState() {
    try {
      const raw = localStorage.getItem(STORAGE_FALLBACK_KEY);
      return sanitizePersistedState(raw ? JSON.parse(raw) : null);
    } catch {
      return sanitizePersistedState(null);
    }
  },
  async savePersistedState(state) {
    try {
      localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  },
  async setWidgetViewMode() {},
  async fetchSheetCsv(csvUrl) {
    try {
      const res = await fetch(csvUrl);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true, csvText: await res.text() };
    } catch {
      return { ok: false, error: 'Không tải được dữ liệu Sheet từ trình duyệt.' };
    }
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
  async hideWidgetToTray() {},
};

export function getDesktopBridge(): DeadlineDesktopBridge {
  return window.deadlineBridge ?? browserFallbackBridge;
}
