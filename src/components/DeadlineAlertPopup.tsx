import { useEffect, useRef, useState } from 'react';
import { AlarmClock, BellRing, Check, EyeOff } from 'lucide-react';
import { formatShortDeadline } from '../appHelpers';
import { playAlertSound } from '../audio/soundEngine';
import { getDesktopBridge } from '../bridge';
import type { DeadlineAlertEvent } from '../core/deadlineTracker';
import { createDefaultSettings, type AppSettings } from '../core/settings';

export function DeadlineAlertPopup() {
  const bridge = getDesktopBridge();
  const [alerts, setAlerts] = useState<DeadlineAlertEvent[]>([]);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const playedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    const syncSettingsAndPlayIfNew = async (incoming: DeadlineAlertEvent[]) => {
      const persisted = await bridge.loadPersistedState();
      if (!active) return;
      setSettings(persisted.settings);
      setAlerts(incoming);

      const top = incoming[0];
      if (!top) return;
      const playKey = `${top.jobId}:${top.deadlineMs}:${top.trollMessage ?? ''}`;
      if (!playedKeysRef.current.has(playKey)) {
        playedKeysRef.current.add(playKey);
        if (persisted.settings.soundEnabled) {
          playAlertSound({
            soundId: persisted.settings.soundId,
            volume: persisted.settings.soundVolume,
            customSoundDataUrl: persisted.settings.customSoundDataUrl,
          });
        }
      }
    };

    void bridge.getPendingAlerts().then((initial) => {
      void syncSettingsAndPlayIfNew(initial);
    });

    const unsubscribe = bridge.onAlertsUpdated((updated) => {
      void syncSettingsAndPlayIfNew(updated);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  const current = alerts[0];
  if (!current) {
    return <div className="alert-popup-shell" />;
  }

  const isTroll = current.alertMode === 'troll';
  const deadlineFormatted = formatShortDeadline(current.deadlineMs);

  return (
    <div className="alert-popup-shell">
      <div className={`alert-popup-card ${isTroll ? 'troll' : 'serious'}`}>
        <div
          className="drag-region"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'grab',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: isTroll ? 28 : 20 }}>
              {isTroll ? '🤡🚨' : <BellRing size={20} color="#38bdf8" />}
            </span>
            <div>
              <div
                style={{
                  fontSize: isTroll ? 16 : 14.5,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  color: isTroll ? '#fed7aa' : '#f8fafc',
                }}
              >
                {isTroll
                  ? ' BÁO ĐỘNG ĐỎ: TỚI GIỜ DEADLINE!'
                  : 'Nhắc hạn hoàn thành công việc'}
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                Hạn chót: {deadlineFormatted}
                {alerts.length > 1 ? ` • Còn ${alerts.length} việc đang chờ xử lý` : ''}
              </div>
            </div>
          </div>
        </div>

        {isTroll && current.trollMessage && (
          <div className="troll-bubble">“{current.trollMessage}”</div>
        )}

        <div className="alert-job-box">
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: current.description ? 4 : 0,
            }}
          >
            📌 {current.title}
          </div>
          {current.description && (
            <div
              style={{
                fontSize: 12,
                color: '#cbd5e1',
                maxHeight: 62,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {current.description}
            </div>
          )}
        </div>

        <div className="alert-actions-row no-drag">
          <button
            type="button"
            className="alert-btn done"
            onClick={() =>
              void bridge.sendAlertAction({ type: 'complete', jobId: current.jobId })
            }
          >
            <Check size={15} />
            Xong rồi!
          </button>

          <button
            type="button"
            className="alert-btn snooze"
            onClick={() =>
              void bridge.sendAlertAction({ type: 'snooze', jobId: current.jobId })
            }
          >
            <AlarmClock size={15} />
            Khất {settings.snoozeMinutes}p
          </button>

          <button
            type="button"
            className="alert-btn dismiss"
            onClick={() =>
              void bridge.sendAlertAction({ type: 'dismiss', jobId: current.jobId })
            }
          >
            <EyeOff size={14} />
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
