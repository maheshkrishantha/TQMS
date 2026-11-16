const DAY_MS = 86_400_000;
const COLOMBO_OFFSET_MS = 330 * 60 * 1000;

export function colomboDayStart(date: Date): Date {
  const local = new Date(date.getTime() + COLOMBO_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - COLOMBO_OFFSET_MS);
}

export function colomboDayDifference(target: Date, current: Date): number {
  return Math.round((colomboDayStart(target).getTime() - colomboDayStart(current).getTime()) / DAY_MS);
}
