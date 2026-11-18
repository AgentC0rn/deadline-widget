import { useState } from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import { SOUND_OPTIONS, playAlertSound } from '../audio/soundEngine';
import { getDesktopBridge } from '../bridge';
import type { AlertMode } from '../core/deadlineTracker';
import {
  type AppSettings,
  DEFAULT_TROLL_MESSAGES,
} from '../core/settings';
import type { ColumnMapping } from '../core/sourceSheetSync';

interface SettingsViewProps {
  settings: AppSettings;
  detectedHeaders: string[];
  detectedColumns: ColumnMapping | null;
  syncStatusText: string | null;
  syncError: string | null;
  isSyncing: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSyncNow: (overrideUrl?: string) => Promise<void>;
  onTriggerTestAlert: () => void;
  onClose: () => void;
}

type SettingsTab = 'sheet' | 'alert' | 'audio';

export function SettingsView({
  settings,
  detectedHeaders,
  detectedColumns,
  syncStatusText,
  syncError,
  isSyncing,
  onUpdateSettings,
  onSyncNow,
  onTriggerTestAlert,
  onClose,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sheet');
  const [newQuote, setNewQuote] = useState('');
  const [audioError, setAudioError] = useState<string | null>(null);

  const handlePickAudio = async () => {
    setAudioError(null);
    const result = await getDesktopBridge().pickCustomAudioFile();
    if (result.canceled) return;
    if (result.error) {
      setAudioError(result.error);
      return;
    }
    if (result.dataUrl) {
      onUpdateSettings({
        soundId: 'custom',
        customSoundDataUrl: result.dataUrl,
        customSoundFileName: result.fileName ?? 'custom-audio',
      });
    }
  };

  const handleAddQuote = () => {
    const trimmed = newQuote.trim();
    if (!trimmed) return;
    onUpdateSettings({
      trollMessages: [...settings.trollMessages, trimmed],
    });
    setNewQuote('');
  };

  const handleDeleteQuote = (idx: number) => {
    const next = settings.trollMessages.filter((_, i) => i !== idx);
    onUpdateSettings({
      trollMessages: next.length > 0 ? next : [...DEFAULT_TROLL_MESSAGES],
    });
  };

  const updateColumnOverride = (key: keyof ColumnMapping, value: string) => {
    onUpdateSettings({
      columnOverrides: {
        ...settings.columnOverrides,
        [key]: value.trim() || null,
      },
    });
  };

  return (
    <>
      <div className="panel-header">
        <div className="brand-row drag-region">
          <button
            type="button"
            className="icon-btn no-drag"
            onClick={onClose}
            title="Quay lại danh sách công việc"
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <div className="brand-title">Cài đặt Widget</div>
            <div className="brand-subtitle">Nguồn Google Sheet, Troll Popup & Âm báo</div>
          </div>
        </div>
      </div>

      <div className="settings-tabs no-drag">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'sheet' ? 'active' : ''}`}
          onClick={() => setActiveTab('sheet')}
        >
          📊 Google Sheet
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'alert' ? 'active' : ''}`}
          onClick={() => setActiveTab('alert')}
        >
          🤡 Báo động & Troll
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          🔊 Âm thanh & Nền
        </button>
      </div>

      <div className="settings-body no-drag">
        {activeTab === 'sheet' && (
          <>
            <div className="setting-group">
              <div className="setting-label">Link Source Sheet (Google Sheet)</div>
              <div className="setting-hint">
                Mở Google Sheet → bấm <b>Share (Chia sẻ)</b> → chọn{' '}
                <b>Anyone with the link (Viewer)</b> rồi dán link vào dưới đây:
              </div>
              <input
                type="url"
                className="field-input"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                value={settings.sourceSheetUrl}
                onChange={(e) => onUpdateSettings({ sourceSheetUrl: e.target.value })}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={isSyncing || !settings.sourceSheetUrl.trim()}
                  onClick={() => void onSyncNow(settings.sourceSheetUrl)}
                >
                  <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
                  {isSyncing ? 'Đang quét...' : 'Kết nối & Quét ngay'}
                </button>
                {settings.sourceSheetUrl && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => onUpdateSettings({ sourceSheetUrl: '' })}
                  >
                    Ngắt kết nối
                  </button>
                )}
              </div>
              {syncError && (
                <div style={{ color: '#fca5a5', fontSize: 11.5 }}>{syncError}</div>
              )}
              {!syncError && syncStatusText && (
                <div style={{ color: '#6ee7b7', fontSize: 11.5 }}>{syncStatusText}</div>
              )}
            </div>

            <div className="setting-group">
              <div className="setting-label">Chu kỳ quét & Giờ hạn chót mặc định</div>
              <div className="two-col">
                <div>
                  <div className="setting-hint" style={{ marginBottom: 4 }}>
                    Quét lại mỗi (giây)
                  </div>
                  <input
                    type="number"
                    min={30}
                    max={900}
                    className="field-input"
                    value={settings.syncIntervalSec}
                    onChange={(e) =>
                      onUpdateSettings({ syncIntervalSec: Number(e.target.value) || 60 })
                    }
                  />
                </div>
                <div>
                  <div className="setting-hint" style={{ marginBottom: 4 }}>
                    Giờ mặc định (ô thiếu giờ)
                  </div>
                  <input
                    type="time"
                    className="field-input"
                    value={settings.defaultDeadlineTime}
                    onChange={(e) =>
                      onUpdateSettings({ defaultDeadlineTime: e.target.value || '17:30' })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-label">Gán cột thủ công (Tuỳ chọn)</div>
              <div className="setting-hint">
                Để trống để tự động nhận diện ({detectedColumns?.titleColumn ?? 'Tên job'} /{' '}
                {detectedColumns?.descriptionColumn ?? 'Mô tả'} /{' '}
                {detectedColumns?.deadlineColumn ?? 'Deadline'}).
              </div>
              <div className="two-col">
                <input
                  list="sheet-headers-list"
                  className="field-input"
                  placeholder="Cột Tên job (VD: Tên job)"
                  value={settings.columnOverrides.titleColumn ?? ''}
                  onChange={(e) => updateColumnOverride('titleColumn', e.target.value)}
                />
                <input
                  list="sheet-headers-list"
                  className="field-input"
                  placeholder="Cột Deadline (VD: Deadline)"
                  value={settings.columnOverrides.deadlineColumn ?? ''}
                  onChange={(e) => updateColumnOverride('deadlineColumn', e.target.value)}
                />
                <input
                  list="sheet-headers-list"
                  className="field-input"
                  placeholder="Cột Mô tả (VD: Mô tả)"
                  value={settings.columnOverrides.descriptionColumn ?? ''}
                  onChange={(e) => updateColumnOverride('descriptionColumn', e.target.value)}
                />
                <input
                  list="sheet-headers-list"
                  className="field-input"
                  placeholder="Cột Mã ID (nếu có)"
                  value={settings.columnOverrides.idColumn ?? ''}
                  onChange={(e) => updateColumnOverride('idColumn', e.target.value)}
                />
              </div>
              <datalist id="sheet-headers-list">
                {detectedHeaders.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </div>
          </>
        )}

        {activeTab === 'alert' && (
          <>
            <div className="setting-group">
              <div className="setting-label">Chế độ cảnh báo (Alert Mode)</div>
              <select
                className="field-select"
                value={settings.alertMode}
                onChange={(e) =>
                  onUpdateSettings({ alertMode: e.target.value as AlertMode })
                }
              >
                <option value="troll">
                  🤡 Chế độ Troll / Cà khịa (Popup vui nhộn + Rung lắc)
                </option>
                <option value="serious">
                  💼 Chế độ Nghiêm túc (Lịch sự khi họp / share màn hình)
                </option>
                <option value="silent">
                  🔕 Chế độ Im lặng (Không bung Popup, chỉ báo màu trên Widget)
                </option>
              </select>

              <div className="two-col" style={{ marginTop: 4 }}>
                <div>
                  <div className="setting-hint" style={{ marginBottom: 4 }}>
                    Thời gian khất Snooze (phút)
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    className="field-input"
                    value={settings.snoozeMinutes}
                    onChange={(e) =>
                      onUpdateSettings({ snoozeMinutes: Number(e.target.value) || 10 })
                    }
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    className="primary-btn"
                    style={{ width: '100%', justifyContent: 'center', height: 31 }}
                    onClick={onTriggerTestAlert}
                  >
                    <Sparkles size={13} />
                    Bắn thử Popup ngay
                  </button>
                </div>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-label">
                <span>Kho câu thoại Troll ({settings.trollMessages.length})</span>
                <button
                  type="button"
                  className="tiny-icon-btn"
                  onClick={() =>
                    onUpdateSettings({ trollMessages: [...DEFAULT_TROLL_MESSAGES] })
                  }
                  title="Khôi phục bộ câu thoại gốc"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Nhập thêm câu cà khịa của riêng bạn..."
                  value={newQuote}
                  onChange={(e) => setNewQuote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddQuote();
                  }}
                />
                <button type="button" className="primary-btn" onClick={handleAddQuote}>
                  <Plus size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {settings.trollMessages.map((msg, idx) => (
                  <div key={`${idx}-${msg.slice(0, 12)}`} className="quote-item">
                    <span style={{ wordBreak: 'break-word' }}>{msg}</span>
                    <button
                      type="button"
                      className="tiny-icon-btn"
                      onClick={() => handleDeleteQuote(idx)}
                      title="Xoá câu này"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'audio' && (
          <>
            <div className="setting-group">
              <div className="setting-label">
                <span>Âm thanh khi chạm Deadline</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                  />
                  <span>Bật âm</span>
                </label>
              </div>

              <select
                className="field-select"
                value={settings.soundId}
                onChange={(e) =>
                  onUpdateSettings({
                    soundId: e.target.value as AppSettings['soundId'],
                  })
                }
              >
                {SOUND_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="setting-hint">
                {SOUND_OPTIONS.find((o) => o.id === settings.soundId)?.subtitle}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handlePickAudio()}
                >
                  <FolderOpen size={13} />
                  {settings.customSoundFileName
                    ? `Đổi file (${settings.customSoundFileName})`
                    : 'Chọn file .mp3 / .wav'}
                </button>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={() =>
                    playAlertSound({
                      soundId: settings.soundId,
                      volume: settings.soundVolume || 0.8,
                      customSoundDataUrl: settings.customSoundDataUrl,
                    })
                  }
                >
                  <Volume2 size={13} />
                  Nghe thử
                </button>
              </div>
              {audioError && (
                <div style={{ color: '#fca5a5', fontSize: 11 }}>{audioError}</div>
              )}

              <div style={{ marginTop: 4 }}>
                <div className="setting-label">
                  <span>Âm lượng</span>
                  <span>{Math.round(settings.soundVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  style={{ width: '100%', accentColor: '#f97316' }}
                  value={settings.soundVolume}
                  onChange={(e) =>
                    onUpdateSettings({ soundVolume: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-label">
                <span>Độ đậm nền cửa sổ nổi (Opacity)</span>
                <span>{Math.round(settings.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.35}
                max={1}
                step={0.03}
                style={{ width: '100%', accentColor: '#f97316' }}
                value={settings.opacity}
                onChange={(e) => onUpdateSettings({ opacity: Number(e.target.value) })}
              />
              <div className="setting-hint">
                Kéo thấp xuống để nhìn xuyên thấu nền màn hình bên dưới Widget.
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
