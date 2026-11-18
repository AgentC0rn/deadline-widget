import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  addLocalJob,
  type AlertMode,
  type DeadlineAlertEvent,
} from '../src/core/deadlineTracker';
import type {
  AlertWindowAction,
  FetchSheetCsvResult,
  PickAudioFileResult,
  TrayCommand,
  WidgetViewMode,
} from '../src/core/ipcContract';
import {
  type PersistedAppState,
  sanitizePersistedState,
} from '../src/core/settings';
import { buildGoogleSheetCsvUrl } from '../src/core/sourceSheetSync';

const MINI_PILL_SIZE = { width: 344, height: 76 };
const CHECKLIST_PANEL_SIZE = { width: 420, height: 620 };
const ALERT_POPUP_SIZE = { width: 468, height: 430 };
const MAX_AUDIO_FILE_BYTES = 12 * 1024 * 1024;

let mainWindow: BrowserWindow | null = null;
let alertWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let currentViewMode: WidgetViewMode = 'checklist-panel';
let pendingAlerts: DeadlineAlertEvent[] = [];
let cachedState: PersistedAppState | null = null;

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), 'deadline-widget-state.json');
}

function seedFirstRunStateIfNeeded(state: PersistedAppState): PersistedAppState {
  if (state.seededDemoJobs || state.tracker.jobs.length > 0) {
    return state;
  }

  const now = Date.now();
  let tracker = state.tracker;
  tracker = addLocalJob(
    tracker,
    {
      id: 'demo-urgent',
      title: 'Duyệt thiết kế Banner chiến dịch',
      description: 'Kiểm tra chính tả & kích thước trước khi gửi khách (Job mẫu)',
      deadlineMs: now + 12 * 60 * 1000,
    },
    now,
  );
  tracker = addLocalJob(
    tracker,
    {
      id: 'demo-warning',
      title: 'Gửi báo cáo tiến độ chiều nay',
      description: 'Tổng hợp các đầu việc quan trọng trong ngày (Job mẫu)',
      deadlineMs: now + 48 * 60 * 1000,
    },
    now,
  );
  tracker = addLocalJob(
    tracker,
    {
      id: 'demo-sheet-tip',
      title: 'Kết nối link Google Sheet công việc',
      description: 'Bấm biểu tượng Cài đặt (⚙) để dán link Google Sheet của bạn vào quét tự động!',
      deadlineMs: now + 3 * 60 * 60 * 1000,
    },
    now,
  );

  return {
    ...state,
    tracker,
    seededDemoJobs: true,
  };
}

function loadStateFromDisk(): PersistedAppState {
  if (cachedState) return cachedState;
  const filePath = getStateFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const rawText = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(rawText) as unknown;
      cachedState = seedFirstRunStateIfNeeded(sanitizePersistedState(parsed));
      return cachedState;
    }
  } catch {
    // Corrupted file falls back cleanly to defaults
  }
  cachedState = seedFirstRunStateIfNeeded(sanitizePersistedState(null));
  saveStateToDisk(cachedState);
  return cachedState;
}

function saveStateToDisk(nextState: PersistedAppState): void {
  const sanitized = sanitizePersistedState(nextState);
  const prevMode = cachedState?.settings.alertMode;
  cachedState = sanitized;

  const filePath = getStateFilePath();
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(sanitized, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf-8');
    } catch {
      // Ignore write lock contention
    }
  }

  if (prevMode !== sanitized.settings.alertMode) {
    rebuildTrayMenu();
  }
}

function clampToVisibleWorkArea(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  const clampedX = Math.max(
    area.x + 8,
    Math.min(x, area.x + area.width - width - 8),
  );
  const clampedY = Math.max(
    area.y + 8,
    Math.min(y, area.y + area.height - height - 8),
  );
  return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function loadRendererEntry(win: BrowserWindow, query?: Record<string, string>): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    if (query) {
      Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    void win.loadURL(url.toString());
    return;
  }

  const indexHtml = path.join(__dirname, '../../dist/index.html');
  void win.loadFile(indexHtml, query ? { query } : undefined);
}

function createMainWindow(): void {
  const state = loadStateFromDisk();
  currentViewMode = state.settings.pinnedExpanded ? 'checklist-panel' : 'mini-pill';
  const initialSize =
    currentViewMode === 'checklist-panel' ? CHECKLIST_PANEL_SIZE : MINI_PILL_SIZE;

  const primaryArea = screen.getPrimaryDisplay().workArea;
  const fallbackPos = {
    x: primaryArea.x + primaryArea.width - initialSize.width - 24,
    y: primaryArea.y + 24,
  };
  const savedPos = state.settings.windowPosition ?? fallbackPos;
  const startPos = clampToVisibleWorkArea(
    savedPos.x,
    savedPos.y,
    initialSize.width,
    initialSize.height,
  );

  mainWindow = new BrowserWindow({
    x: startPos.x,
    y: startPos.y,
    width: initialSize.width,
    height: initialSize.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');

  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    const latest = loadStateFromDisk();
    saveStateToDisk({
      ...latest,
      settings: {
        ...latest.settings,
        windowPosition: { x, y },
      },
    });
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  loadRendererEntry(mainWindow);
}

function ensureAlertWindow(): BrowserWindow {
  if (alertWindow && !alertWindow.isDestroyed()) {
    return alertWindow;
  }

  const primaryArea = screen.getPrimaryDisplay().workArea;
  const x = Math.round(primaryArea.x + (primaryArea.width - ALERT_POPUP_SIZE.width) / 2);
  const y = Math.round(primaryArea.y + (primaryArea.height - ALERT_POPUP_SIZE.height) / 2);

  alertWindow = new BrowserWindow({
    x,
    y,
    width: ALERT_POPUP_SIZE.width,
    height: ALERT_POPUP_SIZE.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  alertWindow.setAlwaysOnTop(true, 'screen-saver');

  alertWindow.on('closed', () => {
    alertWindow = null;
  });

  loadRendererEntry(alertWindow, { window: 'alert' });
  return alertWindow;
}

function createProgrammaticTrayIcon(): Electron.NativeImage {
  const size = 16;
  const bgra = Buffer.alloc(size * size * 4, 0);

  const setPixel = (px: number, py: number, r: number, g: number, b: number, a = 255) => {
    if (px < 0 || px >= size || py < 0 || py >= size) return;
    const offset = (py * size + px) * 4;
    bgra[offset] = b;
    bgra[offset + 1] = g;
    bgra[offset + 2] = r;
    bgra[offset + 3] = a;
  };

  const center = 7.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x - center, y - center);
      if (dist <= 7.2) {
        // Vibrant amber-orange border + dark slate dial
        if (dist >= 5.6) {
          setPixel(x, y, 249, 115, 22);
        } else {
          setPixel(x, y, 15, 23, 42);
        }
      }
    }
  }

  // Clock hands in crisp white
  for (let y = 3; y <= 7; y += 1) setPixel(7, y, 255, 255, 255);
  for (let x = 7; x <= 11; x += 1) setPixel(x, 8, 56, 189, 248);

  return nativeImage.createFromBitmap(bgra, { width: size, height: size });
}

function dispatchTrayCommand(command: TrayCommand): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tray:command', command);
  }
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const state = loadStateFromDisk();
  const mode: AlertMode = state.settings.alertMode;

  const setModeFromTray = (nextMode: AlertMode) => {
    const latest = loadStateFromDisk();
    saveStateToDisk({
      ...latest,
      settings: {
        ...latest.settings,
        alertMode: nextMode,
      },
    });
    dispatchTrayCommand({ type: 'set-alert-mode', alertMode: nextMode });
  };

  const menu = Menu.buildFromTemplate([
    {
      label: 'Hiện / Ẩn Deadline Widget',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '🤡 Chế độ Troll (Cà khịa)',
      type: 'radio',
      checked: mode === 'troll',
      click: () => setModeFromTray('troll'),
    },
    {
      label: '💼 Chế độ Nghiêm túc (Khi họp)',
      type: 'radio',
      checked: mode === 'serious',
      click: () => setModeFromTray('serious'),
    },
    {
      label: '🔕 Chế độ Im lặng',
      type: 'radio',
      checked: mode === 'silent',
      click: () => setModeFromTray('silent'),
    },
    { type: 'separator' },
    {
      label: '🔄 Quét Google Sheet ngay',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
        dispatchTrayCommand({ type: 'sync-now' });
      },
    },
    {
      label: '🧪 Xem thử Popup Deadline Alert',
      click: () => dispatchTrayCommand({ type: 'test-alert' }),
    },
    { type: 'separator' },
    {
      label: '❌ Thoát hẳn ứng dụng',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function createSystemTray(): void {
  tray = new Tray(createProgrammaticTrayIcon());
  tray.setToolTip('Deadline Widget — Đếm ngược công việc');
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  rebuildTrayMenu();
}

function registerIpcHandlers(): void {
  ipcMain.handle('state:load', () => loadStateFromDisk());

  ipcMain.handle('state:save', (_event, nextState: PersistedAppState) => {
    saveStateToDisk(nextState);
  });

  ipcMain.handle('window:set-view-mode', (_event, mode: WidgetViewMode) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (currentViewMode === mode) return;

    const oldBounds = mainWindow.getBounds();
    const targetSize =
      mode === 'checklist-panel' ? CHECKLIST_PANEL_SIZE : MINI_PILL_SIZE;
    const displayArea = screen.getDisplayNearestPoint({
      x: oldBounds.x,
      y: oldBounds.y,
    }).workArea;

    // Anchor right edge when positioned in the right half of the display
    const inRightHalf =
      oldBounds.x + oldBounds.width / 2 > displayArea.x + displayArea.width / 2;
    const desiredX = inRightHalf
      ? oldBounds.x + oldBounds.width - targetSize.width
      : oldBounds.x;

    const nextPos = clampToVisibleWorkArea(
      desiredX,
      oldBounds.y,
      targetSize.width,
      targetSize.height,
    );

    currentViewMode = mode;
    mainWindow.setBounds({
      x: nextPos.x,
      y: nextPos.y,
      width: targetSize.width,
      height: targetSize.height,
    });
  });

  ipcMain.handle('window:hide-to-tray', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  ipcMain.handle(
    'sheet:fetch-csv',
    async (_event, rawOrCsvUrl: string): Promise<FetchSheetCsvResult> => {
      const normalizedUrl = buildGoogleSheetCsvUrl(rawOrCsvUrl);
      if (!normalizedUrl) {
        return {
          ok: false,
          error: 'Link Google Sheet không hợp lệ. Hãy dán link chia sẻ của bảng tính Google Sheet.',
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(normalizedUrl, {
          signal: controller.signal,
          headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' },
          redirect: 'follow',
        });

        if (!response.ok) {
          return {
            ok: false,
            error: `Không tải được Sheet (Mã lỗi HTTP ${response.status}). Hãy kiểm tra quyền chia sẻ công khai.`,
          };
        }

        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        const bodyText = await response.text();

        if (
          response.url.includes('accounts.google.com') ||
          contentType.includes('text/html') ||
          bodyText.trimStart().startsWith('<!DOCTYPE html')
        ) {
          return {
            ok: false,
            error:
              'Google Sheet đang khoá riêng tư! Hãy bấm Share (Chia sẻ) → chọn "Anyone with the link" (Bất kỳ ai có liên kết đều xem được).',
          };
        }

        return { ok: true, csvText: bodyText };
      } catch (err) {
        const message =
          err instanceof Error && err.name === 'AbortError'
            ? 'Quá thời gian kết nối tới Google Sheet (12 giây).'
            : 'Không thể kết nối mạng tới Google Sheet.';
        return { ok: false, error: message };
      } finally {
        clearTimeout(timeout);
      }
    },
  );

  ipcMain.handle('audio:pick-file', async (): Promise<PickAudioFileResult> => {
    const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const dialogResult = owner
      ? await dialog.showOpenDialog(owner, {
          title: 'Chọn âm thanh cảnh báo Deadline',
          filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
          properties: ['openFile'],
        })
      : await dialog.showOpenDialog({
          title: 'Chọn âm thanh cảnh báo Deadline',
          filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
          properties: ['openFile'],
        });

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { canceled: true };
    }

    const chosenPath = dialogResult.filePaths[0]!;
    try {
      const stat = fs.statSync(chosenPath);
      if (stat.size > MAX_AUDIO_FILE_BYTES) {
        return {
          canceled: false,
          error: 'File âm thanh lớn hơn 12MB. Hãy chọn đoạn âm thanh ngắn gọn hơn.',
        };
      }
      const bytes = fs.readFileSync(chosenPath);
      const ext = path.extname(chosenPath).toLowerCase().replace('.', '');
      const mime =
        ext === 'wav'
          ? 'audio/wav'
          : ext === 'ogg'
            ? 'audio/ogg'
            : ext === 'm4a'
              ? 'audio/mp4'
              : 'audio/mpeg';
      const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
      return {
        canceled: false,
        dataUrl,
        fileName: path.basename(chosenPath),
      };
    } catch {
      return {
        canceled: false,
        error: 'Không thể đọc file âm thanh đã chọn.',
      };
    }
  });

  ipcMain.handle('alerts:show', (_event, incomingAlerts: DeadlineAlertEvent[]) => {
    if (!Array.isArray(incomingAlerts) || incomingAlerts.length === 0) return;

    const existingIds = new Set(pendingAlerts.map((a) => a.jobId));
    for (const alert of incomingAlerts) {
      if (existingIds.has(alert.jobId)) {
        pendingAlerts = pendingAlerts.map((a) => (a.jobId === alert.jobId ? alert : a));
      } else {
        pendingAlerts.push(alert);
        existingIds.add(alert.jobId);
      }
    }

    const popup = ensureAlertWindow();
    const pushAndShow = () => {
      if (!popup.isDestroyed()) {
        popup.webContents.send('alerts:updated', pendingAlerts);
        popup.show();
        popup.focus();
      }
    };

    if (popup.webContents.isLoading()) {
      popup.webContents.once('did-finish-load', pushAndShow);
    } else {
      pushAndShow();
    }
  });

  ipcMain.handle('alerts:get-pending', () => pendingAlerts);

  ipcMain.handle('alerts:action', (_event, action: AlertWindowAction) => {
    pendingAlerts = pendingAlerts.filter((a) => a.jobId !== action.jobId);

    if (alertWindow && !alertWindow.isDestroyed()) {
      alertWindow.webContents.send('alerts:updated', pendingAlerts);
      if (pendingAlerts.length === 0) {
        alertWindow.hide();
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('alerts:action-forwarded', action);
    }
  });
}

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    registerIpcHandlers();
    createMainWindow();
    createSystemTray();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) {
      app.quit();
    }
  });
}
