export function nowIso(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function uptimeSeconds(startedAt: number): number {
  return Math.floor((Date.now() - startedAt) / 1000);
}
