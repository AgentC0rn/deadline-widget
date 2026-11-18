import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  Minimize2,
  Pin,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { playPreDeadlineHeadsUp } from './audio/soundEngine';
import { getDesktopBridge } from './bridge';
import { DeadlineAlertPopup } from './components/DeadlineAlertPopup';
import { MiniPillView } from './components/MiniPillView';
import { SettingsView } from './components/SettingsView';
import {
  type LocalFormDraft,
  formatDatetimeLocalInput,
  formatShortDeadline,
  nextAlertMode,
} from './appHelpers';
import {
  type AlertMode,
  type DeadlineAlertEvent,
  type JobView,
  type TrackerState,
  addLocalJob,
  completeHistoricalOverdueJobs,
  countHistoricalOverdueJobs,
  createEmptyTrackerState,
  deleteLocalJob,
  evaluateAlertsAt,
  getChecklistSnapshot,
  reconcileSheetJobs,
  snoozeJobAlert,
  toggleJobCompletion,
  updateLocalJob,
} from './core/deadlineTracker';
import type { WidgetViewMode } from './core/ipcContract';
import {
  type AppSettings,
  createDefaultSettings,
} from './core/settings';
import {
  type ColumnMapping,
  buildGoogleSheetCsvUrl,
  parseSourceSheetCsv,
} from './core/sourceSheetSync';

const ALERT_MODE_LABELS: Record<AlertMode, string> = {
  troll: '🤡 Chế độ Troll',
  serious: '💼 Nghiêm túc',
  silent: '🔕 Im lặng',
};

export function App() {
  const isAlertPopupWindow = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('window') === 'alert';
  }, []);

  if (isAlertPopupWindow) {
    return <DeadlineAlertPopup />;
  }

  return <FloatingWidgetMain />;
}

function FloatingWidgetMain() {
  const bridge = getDesktopBridge();
  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings);
  const [tracker, setTracker] = useState<TrackerState>(createEmptyTrackerState);
  const [seededDemoJobs, setSeededDemoJobs] = useState(true);
  const [viewMode, setViewMode] = useState<WidgetViewMode>('checklist-panel');
  const [showSettings, setShowSettings] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Local Job form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocalFormDraft>(() => ({
    title: '',
    description: '',
    deadlineInput: formatDatetimeLocalInput(Date.now() + 60 * 60 * 1000),
  }));

  // Google Sheet sync feedback
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<ColumnMapping | null>(null);
  const [criticalCueBanner, setCriticalCueBanner] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const trackerRef = useRef(tracker);
  trackerRef.current = tracker;

  const showSettingsRef = useRef(showSettings);
  showSettingsRef.current = showSettings;

  const switchViewMode = useCallback(
    (nextMode: WidgetViewMode) => {
      setViewMode(nextMode);
      void bridge.setWidgetViewMode(nextMode);
    },
    [bridge],
  );

  // Hydrate persisted state on launch
  useEffect(() => {
    let active = true;
    void bridge.loadPersistedState().then((persisted) => {
      if (!active) return;
      setSettings(persisted.settings);
      setTracker(persisted.tracker);
      setSeededDemoJobs(persisted.seededDemoJobs);
      const initialMode: WidgetViewMode = persisted.settings.pinnedExpanded
        ? 'checklist-panel'
        : 'mini-pill';
      setViewMode(initialMode);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [bridge]);

  // Persist changes to disk
  useEffect(() => {
    if (!hydrated) return;
    void bridge.savePersistedState({
      version: 1,
      settings,
      tracker,
      seededDemoJobs,
    });
  }, [hydrated, settings, tracker, seededDemoJobs, bridge]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const syncSourceSheet = useCallback(
    async (explicitUrl?: string) => {
      const targetUrl = (explicitUrl ?? settingsRef.current.sourceSheetUrl).trim();
      if (!targetUrl) {
        setSyncError(null);
        setSyncStatusText(null);
        return;
      }

      const csvUrl = buildGoogleSheetCsvUrl(targetUrl);
      if (!csvUrl) {
        setSyncError('Link Google Sheet không đúng định dạng.');
        return;
      }

      setIsSyncing(true);
      setSyncError(null);
      try {
        const response = await bridge.fetchSheetCsv(csvUrl);
        if (!response.ok || response.csvText === undefined) {
          setSyncError(response.error ?? 'Không tải được dữ liệu Google Sheet.');
          return;
        }

        const parsed = parseSourceSheetCsv(response.csvText, {
          defaultDeadlineTime: settingsRef.current.defaultDeadlineTime,
          columnOverrides: settingsRef.current.columnOverrides,
        });

        setDetectedHeaders(parsed.headers);
        setDetectedColumns(parsed.detectedColumns);

        if (!parsed.detectedColumns.titleColumn || !parsed.detectedColumns.deadlineColumn) {
          setSyncError(
            'Chưa tìm thấy cột "Tên job" hoặc "Deadline". Hãy chọn cột thủ công trong phần Cài đặt.',
          );
          return;
        }

        const syncTime = Date.now();
        setTracker((prev) => reconcileSheetJobs(prev, parsed.jobs, syncTime));
        setNowMs(syncTime);
        const timeStr = new Date(syncTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setSyncStatusText(
          `Đã đồng bộ ${parsed.jobs.length} Sheet Job lúc ${timeStr}`,
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [bridge],
  );

  // Auto-sync Source Sheet (debounced on URL/config edits + periodic polling)
  useEffect(() => {
    if (!hydrated) return;
    const trimmedUrl = settings.sourceSheetUrl.trim();
    if (!trimmedUrl) {
      setTracker((prev) => reconcileSheetJobs(prev, [], Date.now()));
      setSyncStatusText(null);
      setSyncError(null);
      return;
    }

    const debounceId = window.setTimeout(() => {
      void syncSourceSheet(trimmedUrl);
    }, 550);

    const intervalMs = Math.max(30, settings.syncIntervalSec) * 1_000;
    const timer = window.setInterval(() => {
      void syncSourceSheet();
    }, intervalMs);
    return () => {
      window.clearTimeout(debounceId);
      window.clearInterval(timer);
    };
  }, [
    hydrated,
    settings.sourceSheetUrl,
    settings.syncIntervalSec,
    settings.defaultDeadlineTime,
    settings.columnOverrides,
    syncSourceSheet,
  ]);

  // Auto-collapse back to Mini Pill on window blur when unpinned
  useEffect(() => {
    return bridge.onWindowBlurred(() => {
      if (
        !settingsRef.current.pinnedExpanded &&
        !showSettingsRef.current
      ) {
        switchViewMode('mini-pill');
      }
    });
  }, [bridge, switchViewMode]);

  const triggerTestAlert = useCallback(() => {
    const currentSettings = settingsRef.current;
    const modeForPreview: 'troll' | 'serious' =
      currentSettings.alertMode === 'serious' ? 'serious' : 'troll';
    const messages = currentSettings.trollMessages;
    const randomMsg =
      messages[Math.floor(Math.random() * messages.length)] ??
      'Deadline tới chân rồi còn ngồi đó à?!';

    const previewEvent: DeadlineAlertEvent = {
      jobId: `preview-${Date.now()}`,
      title: 'Gửi báo cáo cho Sếp (Bản xem thử)',
      description: 'Đây là cửa sổ xem thử để bạn kiểm tra hiệu ứng câu thoại & âm báo!',
      deadlineMs: Date.now(),
      alertMode: modeForPreview,
      ...(modeForPreview === 'troll' ? { trollMessage: randomMsg } : {}),
    };

    void bridge.showDeadlineAlerts([previewEvent]);
  }, [bridge]);

  // 1-second live tick + DeadlineAlert evaluation
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      const currentNow = Date.now();
      setNowMs(currentNow);

      const currentSettings = settingsRef.current;
      const evaluation = evaluateAlertsAt(trackerRef.current, {
        nowMs: currentNow,
        alertMode: currentSettings.alertMode,
        trollMessages: currentSettings.trollMessages,
      });

      if (evaluation.state !== trackerRef.current) {
        setTracker(evaluation.state);
      }

      if (evaluation.preDeadlineCues.length > 0) {
        const firstCue = evaluation.preDeadlineCues[0];
        if (firstCue) {
          setCriticalCueBanner(`⚠️ Sắp hết giờ (< 15p): ${firstCue.title}`);
        }
        if (currentSettings.soundEnabled) {
          playPreDeadlineHeadsUp(currentSettings.soundVolume);
        }
      }

      if (evaluation.deadlineAlerts.length > 0) {
        void bridge.showDeadlineAlerts(evaluation.deadlineAlerts);
      }
    };

    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [hydrated, bridge]);

  // Handle actions sent back from the Deadline Alert Popup window
  useEffect(() => {
    return bridge.onAlertAction((action) => {
      if (action.jobId.startsWith('preview-')) return;
      const actionTime = Date.now();
      setNowMs(actionTime);

      if (action.type === 'complete') {
        setTracker((prev) => {
          const target = prev.jobs.find((j) => j.id === action.jobId);
          if (!target || target.completed) return prev;
          return toggleJobCompletion(prev, action.jobId, actionTime);
        });
      } else if (action.type === 'snooze') {
        setTracker((prev) =>
          snoozeJobAlert(
            prev,
            action.jobId,
            settingsRef.current.snoozeMinutes,
            actionTime,
          ),
        );
      }
    });
  }, [bridge]);

  // Handle commands from Windows System Tray menu
  useEffect(() => {
    return bridge.onTrayCommand((cmd) => {
      if (cmd.type === 'set-alert-mode') {
        updateSettings({ alertMode: cmd.alertMode });
      } else if (cmd.type === 'sync-now') {
        void syncSourceSheet();
      } else if (cmd.type === 'test-alert') {
        triggerTestAlert();
      }
    });
  }, [bridge, updateSettings, syncSourceSheet, triggerTestAlert]);

  const snapshot = useMemo(
    () => getChecklistSnapshot(tracker, nowMs),
    [tracker, nowMs],
  );

  const oldOverdueCount = useMemo(
    () => countHistoricalOverdueJobs(snapshot.incompleteJobs),
    [snapshot.incompleteJobs],
  );

  const hasOverdueInSilentMode =
    settings.alertMode === 'silent' &&
    snapshot.incompleteJobs.some((job) => job.isOverdue);

  if (viewMode === 'mini-pill') {
    return (
      <MiniPillView
        snapshot={snapshot}
        opacity={settings.opacity}
        onExpand={() => switchViewMode('checklist-panel')}
      />
    );
  }

  const openCreateForm = () => {
    setEditingJobId(null);
    setDraft({
      title: '',
      description: '',
      deadlineInput: formatDatetimeLocalInput(Date.now() + 60 * 60 * 1000),
    });
    setFormOpen(true);
  };

  const openEditForm = (job: JobView) => {
    setEditingJobId(job.id);
    setDraft({
      title: job.title,
      description: job.description,
      deadlineInput: formatDatetimeLocalInput(job.deadlineMs),
    });
    setFormOpen(true);
  };

  const submitLocalJobForm = () => {
    const trimmedTitle = draft.title.trim();
    const parsedDeadline = Date.parse(draft.deadlineInput);
    if (!trimmedTitle || Number.isNaN(parsedDeadline)) return;

    const currentTime = Date.now();
    if (editingJobId) {
      setTracker((prev) =>
        updateLocalJob(
          prev,
          editingJobId,
          {
            title: trimmedTitle,
            description: draft.description,
            deadlineMs: parsedDeadline,
          },
          currentTime,
        ),
      );
    } else {
      setTracker((prev) =>
        addLocalJob(
          prev,
          {
            title: trimmedTitle,
            description: draft.description,
            deadlineMs: parsedDeadline,
          },
          currentTime,
        ),
      );
    }
    setNowMs(currentTime);
    setFormOpen(false);
    setEditingJobId(null);
  };

  return (
    <div className="panel-shell">
      <div
        className={`panel-card ${hasOverdueInSilentMode ? 'silent-overdue' : ''}`}
        style={{ background: `rgba(15, 23, 42, ${settings.opacity})` }}
      >
        {showSettings ? (
          <SettingsView
            settings={settings}
            detectedHeaders={detectedHeaders}
            detectedColumns={detectedColumns}
            syncStatusText={syncStatusText}
            syncError={syncError}
            isSyncing={isSyncing}
            onUpdateSettings={updateSettings}
            onSyncNow={syncSourceSheet}
            onTriggerTestAlert={triggerTestAlert}
            onClose={() => setShowSettings(false)}
          />
        ) : (
          <>
            <div className="panel-header">
              <div className="brand-row drag-region" title="Kéo để di chuyển Widget">
                <div className="brand-badge">
                  <Timer size={15} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="brand-title">Deadline Widget</div>
                  <div className="brand-subtitle">
                    {snapshot.incompleteCount > 0
                      ? `Đang chạy ${snapshot.incompleteCount} công việc`
                      : 'Đã hoàn thành mọi đầu việc'}
                  </div>
                </div>
              </div>

              <div className="header-tools no-drag">
                {settings.sourceSheetUrl && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void syncSourceSheet()}
                    title={syncStatusText ?? 'Quét lại Google Sheet ngay'}
                  >
                    <RefreshCw size={13.5} className={isSyncing ? 'spin' : ''} />
                  </button>
                )}

                <button
                  type="button"
                  className={`icon-btn ${settings.soundEnabled ? 'active' : ''}`}
                  onClick={() =>
                    updateSettings({ soundEnabled: !settings.soundEnabled })
                  }
                  title={settings.soundEnabled ? 'Đang bật âm báo' : 'Đang tắt âm báo'}
                >
                  {settings.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>

                <button
                  type="button"
                  className={`icon-btn ${settings.pinnedExpanded ? 'active' : ''}`}
                  onClick={() =>
                    updateSettings({ pinnedExpanded: !settings.pinnedExpanded })
                  }
                  title={
                    settings.pinnedExpanded
                      ? 'Đang ghim mở rộng khi khởi động'
                      : 'Khởi động ở chế độ Mini Pill thu gọn'
                  }
                >
                  <Pin size={13.5} />
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowSettings(true)}
                  title="Cài đặt Google Sheet, Troll & Âm báo"
                >
                  <SettingsIcon size={14} />
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => switchViewMode('mini-pill')}
                  title="Thu gọn thành thanh nổi Mini Pill"
                >
                  <Minimize2 size={13.5} />
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void bridge.hideWidgetToTray()}
                  title="Ẩn xuống khay hệ thống (System Tray)"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="subbar no-drag">
              <button
                type="button"
                className="mode-chip"
                onClick={() =>
                  updateSettings({ alertMode: nextAlertMode(settings.alertMode) })
                }
                title="Bấm để đổi nhanh chế độ thông báo"
              >
                {ALERT_MODE_LABELS[settings.alertMode]}
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={() => (formOpen ? setFormOpen(false) : openCreateForm())}
              >
                <Plus size={14} />
                Thêm Job nhanh
              </button>
            </div>

            {criticalCueBanner && (
              <div className="banner-strip critical-cue no-drag">
                <span>{criticalCueBanner}</span>
                <button
                  type="button"
                  className="tiny-icon-btn"
                  onClick={() => setCriticalCueBanner(null)}
                  title="Đóng nhắc nhở"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {syncError && (
              <div className="banner-strip error no-drag">
                <span>{syncError}</span>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowSettings(true)}
                >
                  Sửa
                </button>
              </div>
            )}

            {oldOverdueCount > 0 && (
              <div className="banner-strip overdue-clean no-drag">
                <span>Có {oldOverdueCount} việc đã quá hạn từ lâu</span>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() =>
                    setTracker((prev) =>
                      completeHistoricalOverdueJobs(prev, Date.now()),
                    )
                  }
                >
                  <CheckCheck size={13} />
                  Xong việc cũ
                </button>
              </div>
            )}

            {formOpen && (
              <div className="job-form no-drag">
                <input
                  type="text"
                  className="field-input"
                  placeholder="Tên công việc cần làm..."
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
                <textarea
                  className="field-textarea"
                  placeholder="Mô tả ngắn / ghi chú (không bắt buộc)..."
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="datetime-local"
                    className="field-input"
                    style={{ flex: 1 }}
                    value={draft.deadlineInput}
                    onChange={(e) =>
                      setDraft({ ...draft, deadlineInput: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={submitLocalJobForm}
                  >
                    {editingJobId ? 'Lưu' : 'Tạo'}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setFormOpen(false);
                      setEditingJobId(null);
                    }}
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            )}

            <div className="job-scroll-area no-drag">
              {snapshot.incompleteJobs.length === 0 &&
                snapshot.completedJobs.length === 0 && (
                  <div className="empty-box">
                    Chưa có công việc nào!
                    <br />
                    Bấm <b>+ Thêm Job nhanh</b> hoặc vào <b>Cài đặt (⚙)</b> để dán link
                    Google Sheet quét tự động.
                  </div>
                )}

              {snapshot.incompleteJobs.map((job) => (
                <div
                  key={job.id}
                  className={`job-card urgency-${job.urgency}`}
                >
                  <button
                    type="button"
                    className="check-circle"
                    onClick={() =>
                      setTracker((prev) =>
                        toggleJobCompletion(prev, job.id, Date.now()),
                      )
                    }
                    title="Đánh dấu hoàn thành"
                  />

                  <div className="job-body">
                    <div className="job-top-line">
                      <div className="job-title">{job.title}</div>
                      <span
                        className={`countdown-badge ${job.urgency}`}
                        style={{ cursor: 'default', flexShrink: 0 }}
                      >
                        {job.countdownText}
                      </span>
                    </div>

                    {job.description && (
                      <div className="job-desc">{job.description}</div>
                    )}

                    <div className="job-meta-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`source-tag ${job.kind}`}>
                          {job.kind === 'sheet' ? 'Sheet' : 'Cá nhân'}
                        </span>
                        <span className="deadline-stamp">
                          <Clock size={11} />
                          {formatShortDeadline(job.deadlineMs)}
                          {job.snoozeUntilMs && job.snoozeUntilMs > nowMs
                            ? ' • Đang khất'
                            : ''}
                        </span>
                      </div>

                      {job.kind === 'local' && (
                        <div className="mini-actions">
                          <button
                            type="button"
                            className="tiny-icon-btn"
                            onClick={() => openEditForm(job)}
                            title="Sửa công việc"
                          >
                            <Edit3 size={12.5} />
                          </button>
                          <button
                            type="button"
                            className="tiny-icon-btn"
                            onClick={() =>
                              setTracker((prev) => deleteLocalJob(prev, job.id))
                            }
                            title="Xoá công việc"
                          >
                            <Trash2 size={12.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {snapshot.completedJobs.length > 0 && (
                <>
                  <button
                    type="button"
                    className="completed-divider"
                    onClick={() => setShowCompleted((v) => !v)}
                  >
                    <span>Đã hoàn thành ({snapshot.completedJobs.length})</span>
                    {showCompleted ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>

                  {showCompleted &&
                    snapshot.completedJobs.map((job) => (
                      <div key={job.id} className="job-card completed">
                        <button
                          type="button"
                          className="check-circle checked"
                          onClick={() =>
                            setTracker((prev) =>
                              toggleJobCompletion(prev, job.id, Date.now()),
                            )
                          }
                          title="Bỏ đánh dấu hoàn thành"
                        >
                          <Check size={13} />
                        </button>
                        <div className="job-body">
                          <div className="job-top-line">
                            <div className="job-title">{job.title}</div>
                            {job.kind === 'local' && (
                              <button
                                type="button"
                                className="tiny-icon-btn"
                                onClick={() =>
                                  setTracker((prev) => deleteLocalJob(prev, job.id))
                                }
                                title="Xoá công việc"
                              >
                                <Trash2 size={12.5} />
                              </button>
                            )}
                          </div>
                          <div className="job-meta-row">
                            <span className={`source-tag ${job.kind}`}>
                              {job.kind === 'sheet' ? 'Sheet' : 'Cá nhân'}
                            </span>
                            <span className="deadline-stamp">
                              Hạn: {formatShortDeadline(job.deadlineMs)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
