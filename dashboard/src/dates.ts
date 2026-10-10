// The backend groups days in America/New_York, so the dashboard does too.
const TIME_ZONE = 'America/New_York';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }); // en-CA formats as YYYY-MM-DD

export const today = () => dayFormat.format(new Date());

/** Shifts a YYYY-MM-DD string by whole days (calendar math in UTC, so no DST surprises). */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

export const formatDay = (day: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...options });

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [[60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week']];
  let value = seconds / 60;
  let unit = 'minute';
  for (let i = 1; i < units.length && value >= units[i][0]; i++) {
    value /= units[i][0];
    unit = units[i][1];
  }
  const n = Math.floor(value);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}
