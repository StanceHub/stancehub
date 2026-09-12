/**
 * Stable in-app URL contract for meeting deep-links (search, ask citations, tasks).
 * Query `t` is milliseconds from meeting start (chunk/citation startMs).
 */

export function meetingPath(meetingId: string, opts?: { tMs?: number | null }): string {
  const id = meetingId.trim();
  if (!id) {
    throw new Error("meetingId is required");
  }
  const base = `/meetings/${encodeURIComponent(id)}`;
  if (opts?.tMs == null) return base;
  if (!Number.isFinite(opts.tMs)) return base;
  const t = Math.floor(opts.tMs);
  if (!Number.isSafeInteger(t) || t < 0) return base;
  return `${base}?t=${t}`;
}

/** Parse `t` from searchParams; invalid → null (ignore, do not 400 the page). */
export function parseMeetingTimeParam(raw: string | string[] | undefined | null): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value === "") return null;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

export function formatMeetingTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
