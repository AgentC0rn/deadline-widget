import { GripVertical, Maximize2 } from 'lucide-react';
import type { ChecklistSnapshot } from '../core/deadlineTracker';

interface MiniPillViewProps {
  snapshot: ChecklistSnapshot;
  opacity: number;
  onExpand: () => void;
}

export function MiniPillView({
  snapshot,
  opacity,
  onExpand,
}: MiniPillViewProps) {
  const { miniPillJob, incompleteCount } = snapshot;
  const urgency = miniPillJob?.urgency ?? 'normal';

  return (
    <div className="mini-pill-shell">
      <div
        className={`mini-pill-card urgency-${urgency}`}
        style={{ background: `rgba(15, 23, 42, ${opacity})` }}
      >
        <div
          className="drag-region"
          style={{
            display: 'flex',
            alignItems: 'center',
            color: '#64748b',
            cursor: 'grab',
            padding: '4px 2px',
          }}
          title="Kéo để di chuyển Widget"
        >
          <GripVertical size={15} />
        </div>

        <button
          type="button"
          className="mini-pill-left no-drag"
          style={{
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
          }}
          onClick={onExpand}
          title="Bấm để mở rộng Checklist Panel"
        >
          <span className={`status-dot ${urgency}`} />
          <div className="mini-pill-info">
            <div className="mini-pill-title">
              {miniPillJob
                ? miniPillJob.title
                : '🎉 Tuyệt vời! Không còn việc tồn'}
            </div>
            <div className="mini-pill-sub">
              {incompleteCount > 0
                ? `${miniPillJob?.isOverdue ? 'Đã quá hạn • ' : ''}Còn ${incompleteCount} việc chưa xong`
                : 'Bấm để mở danh sách công việc'}
            </div>
          </div>
        </button>

        <div className="mini-pill-actions no-drag">
          {miniPillJob && (
            <button
              type="button"
              className={`countdown-badge ${urgency}`}
              onClick={onExpand}
              title="Bấm để mở danh sách Checklist"
            >
              {miniPillJob.countdownText}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={onExpand}
            title="Mở rộng Checklist Panel"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
