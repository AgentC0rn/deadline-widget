import type { AlertMode } from './core/deadlineTracker';

export interface LocalFormDraft {
  title: string;
  description: string;
  deadlineInput: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDatetimeLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatShortDeadline(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

export function nextAlertMode(current: AlertMode): AlertMode {
  if (current === 'troll') return 'serious';
  if (current === 'serious') return 'silent';
  return 'troll';
}
