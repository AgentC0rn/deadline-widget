export interface ColumnMapping {
  idColumn: string | null;
  titleColumn: string | null;
  descriptionColumn: string | null;
  deadlineColumn: string | null;
}

export interface SheetJobInput {
  id: string;
  title: string;
  description: string;
  deadlineMs: number;
}

export interface ParseSourceSheetOptions {
  defaultDeadlineTime: string; // "HH:mm"
  columnOverrides?: Partial<ColumnMapping>;
}

export interface ParseSourceSheetResult {
  headers: string[];
  detectedColumns: ColumnMapping;
  jobs: SheetJobInput[];
  skippedRows: number;
}

export function buildGoogleSheetCsvUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'docs.google.com') {
    if (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      (parsed.pathname.endsWith('.csv') ||
        parsed.searchParams.get('output') === 'csv' ||
        parsed.searchParams.get('format') === 'csv')
    ) {
      return parsed.toString();
    }
    return null;
  }

  // Already a published /e/2PACX-.../pub?output=csv link
  if (
    parsed.pathname.includes('/spreadsheets/d/e/') &&
    parsed.searchParams.get('output') === 'csv'
  ) {
    return parsed.toString();
  }

  const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1] || match[1] === 'e') {
    return null;
  }

  const spreadsheetId = match[1];
  let gid = parsed.searchParams.get('gid');
  if (!gid && parsed.hash) {
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    gid = hashParams.get('gid');
  }

  const exportUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`,
  );
  exportUrl.searchParams.set('format', 'csv');
  if (gid && /^\d+$/.test(gid)) {
    exportUrl.searchParams.set('gid', gid);
  }
  return exportUrl.toString();
}

export function parseCsvRows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

function normalizeKeyword(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ID_PATTERNS = ['id', 'ma job', 'job id', 'ma cong viec', 'code'];
const TITLE_PATTERNS = [
  'ten job',
  'job',
  'cong viec',
  'ten cong viec',
  'hang muc',
  'dau viec',
  'title',
  'name',
];
const DESCRIPTION_PATTERNS = [
  'mo ta',
  'chi tiet',
  'ghi chu',
  'noi dung',
  'description',
  'detail',
  'notes',
  'note',
];
const DEADLINE_PATTERNS = [
  'deadline',
  'han chot',
  'thoi han',
  'han hoan thanh',
  'ngay giao',
  'ngay het han',
];

function matchColumnHeader(
  headers: string[],
  patterns: string[],
  usedIndices: Set<number>,
): { name: string | null; index: number } {
  for (const pattern of patterns) {
    const exactIdx = headers.findIndex(
      (h, idx) => !usedIndices.has(idx) && normalizeKeyword(h) === pattern,
    );
    if (exactIdx !== -1) {
      usedIndices.add(exactIdx);
      return { name: headers[exactIdx]!, index: exactIdx };
    }
  }

  for (const pattern of patterns) {
    const partialIdx = headers.findIndex(
      (h, idx) => !usedIndices.has(idx) && normalizeKeyword(h).includes(pattern),
    );
    if (partialIdx !== -1) {
      usedIndices.add(partialIdx);
      return { name: headers[partialIdx]!, index: partialIdx };
    }
  }

  return { name: null, index: -1 };
}

function parseDefaultTime(defaultTime: string): { hours: number; minutes: number } {
  const match = defaultTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hours: 17, minutes: 30 };
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return { hours, minutes };
}

function buildValidLocalTimestamp(
  year: number,
  monthOneBased: number,
  day: number,
  hours: number,
  minutes: number,
  seconds = 0,
): number | null {
  if (monthOneBased < 1 || monthOneBased > 12 || day < 1 || day > 31) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return null;
  }
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(fullYear, monthOneBased - 1, day, hours, minutes, seconds, 0);
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== monthOneBased - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

export function parseDeadlineCell(
  rawCell: string,
  defaultDeadlineTime = '17:30',
): number | null {
  const value = rawCell.trim();
  if (!value) return null;

  const fallback = parseDefaultTime(defaultDeadlineTime);

  // 1. DD/MM/YYYY HH:mm(:ss)? (or DD-MM-YYYY)
  const dmyTime = value.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|SA|CH))?$/i,
  );
  if (dmyTime) {
    let hours = Number(dmyTime[4]);
    const meridiem = dmyTime[7]?.toUpperCase();
    if ((meridiem === 'PM' || meridiem === 'CH') && hours < 12) hours += 12;
    if ((meridiem === 'AM' || meridiem === 'SA') && hours === 12) hours = 0;
    return buildValidLocalTimestamp(
      Number(dmyTime[3]),
      Number(dmyTime[2]),
      Number(dmyTime[1]),
      hours,
      Number(dmyTime[5]),
      dmyTime[6] ? Number(dmyTime[6]) : 0,
    );
  }

  // 2. HH:mm(:ss)? DD/MM/YYYY
  const timeDmy = value.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/,
  );
  if (timeDmy) {
    return buildValidLocalTimestamp(
      Number(timeDmy[6]),
      Number(timeDmy[5]),
      Number(timeDmy[4]),
      Number(timeDmy[1]),
      Number(timeDmy[2]),
      timeDmy[3] ? Number(timeDmy[3]) : 0,
    );
  }

  // 3. YYYY-MM-DD[T ]HH:mm(:ss)?
  const ymdTime = value.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (ymdTime) {
    return buildValidLocalTimestamp(
      Number(ymdTime[1]),
      Number(ymdTime[2]),
      Number(ymdTime[3]),
      Number(ymdTime[4]),
      Number(ymdTime[5]),
      ymdTime[6] ? Number(ymdTime[6]) : 0,
    );
  }

  // 4. Date-only DD/MM/YYYY
  const dmyOnly = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyOnly) {
    return buildValidLocalTimestamp(
      Number(dmyOnly[3]),
      Number(dmyOnly[2]),
      Number(dmyOnly[1]),
      fallback.hours,
      fallback.minutes,
    );
  }

  // 5. Date-only YYYY-MM-DD
  const ymdOnly = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdOnly) {
    return buildValidLocalTimestamp(
      Number(ymdOnly[1]),
      Number(ymdOnly[2]),
      Number(ymdOnly[3]),
      fallback.hours,
      fallback.minutes,
    );
  }

  const parsedFallback = Date.parse(value);
  return Number.isNaN(parsedFallback) ? null : parsedFallback;
}

export function parseSourceSheetCsv(
  csvText: string,
  options: ParseSourceSheetOptions,
): ParseSourceSheetResult {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return {
      headers: [],
      detectedColumns: {
        idColumn: null,
        titleColumn: null,
        descriptionColumn: null,
        deadlineColumn: null,
      },
      jobs: [],
      skippedRows: 0,
    };
  }

  const headers = rows[0]!;
  const used = new Set<number>();

  const resolveColumn = (
    overrideName: string | null | undefined,
    patterns: string[],
  ): { name: string | null; index: number } => {
    if (overrideName && overrideName.trim()) {
      const idx = headers.findIndex(
        (h) => h.trim().toLowerCase() === overrideName.trim().toLowerCase(),
      );
      if (idx !== -1) {
        used.add(idx);
        return { name: headers[idx]!, index: idx };
      }
    }
    return matchColumnHeader(headers, patterns, used);
  };

  const titleCol = resolveColumn(options.columnOverrides?.titleColumn, TITLE_PATTERNS);
  const deadlineCol = resolveColumn(
    options.columnOverrides?.deadlineColumn,
    DEADLINE_PATTERNS,
  );
  const descriptionCol = resolveColumn(
    options.columnOverrides?.descriptionColumn,
    DESCRIPTION_PATTERNS,
  );
  const idCol = resolveColumn(options.columnOverrides?.idColumn, ID_PATTERNS);

  const detectedColumns: ColumnMapping = {
    idColumn: idCol.name,
    titleColumn: titleCol.name,
    descriptionColumn: descriptionCol.name,
    deadlineColumn: deadlineCol.name,
  };

  if (titleCol.index === -1 || deadlineCol.index === -1) {
    return {
      headers,
      detectedColumns,
      jobs: [],
      skippedRows: Math.max(0, rows.length - 1),
    };
  }

  const jobs: SheetJobInput[] = [];
  const titleOccurrences = new Map<string, number>();
  let skippedRows = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    const title = (row[titleCol.index] ?? '').trim();
    const rawDeadline = (row[deadlineCol.index] ?? '').trim();

    if (!title || !rawDeadline) {
      skippedRows += 1;
      continue;
    }

    const deadlineMs = parseDeadlineCell(rawDeadline, options.defaultDeadlineTime);
    if (deadlineMs === null) {
      skippedRows += 1;
      continue;
    }

    const description =
      descriptionCol.index !== -1 ? (row[descriptionCol.index] ?? '').trim() : '';
    const explicitId =
      idCol.index !== -1 ? normalizeKeyword(row[idCol.index] ?? '') : '';

    let stableId: string;
    if (explicitId) {
      stableId = `sheet:id:${explicitId.replace(/\s+/g, '-')}`;
    } else {
      const slug = normalizeKeyword(title).replace(/\s+/g, '-') || `row-${r}`;
      const count = (titleOccurrences.get(slug) ?? 0) + 1;
      titleOccurrences.set(slug, count);
      stableId = count === 1 ? `sheet:title:${slug}` : `sheet:title:${slug}:${count}`;
    }

    jobs.push({
      id: stableId,
      title,
      description,
      deadlineMs,
    });
  }

  return {
    headers,
    detectedColumns,
    jobs,
    skippedRows,
  };
}
