export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

export function normalizeLimit(limit: number | undefined, defaultValue = DEFAULT_LIMIT): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return defaultValue;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
}

export function normalizeStringArray(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  return values
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

export function escapeFts5Query(query: string): string {
  return query.replace(/[()^*:]/g, (character) => `"${character}"`).trim();
}

export function parseJsonField<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function parseJsonArray(value: string | null): string[] {
  const parsed = parseJsonField<unknown>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => (typeof entry === 'string' ? entry : null))
    .filter((entry): entry is string => Boolean(entry));
}

export function sqlLikePattern(value: string): string {
  return `%${value.toLowerCase()}%`;
}

export function ageInDays(fromDate: string, toDate: string): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / millisecondsPerDay));
}

export function frequencyThresholdDays(frequency: string): number {
  switch (frequency) {
    case 'daily':
      return 30;
    case 'weekly':
      return 60;
    case 'monthly':
      return 120;
    case 'on_change':
      return 90;
    default:
      return 30;
  }
}
