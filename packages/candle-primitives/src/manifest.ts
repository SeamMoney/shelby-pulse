export interface ShelbyManifest {
  matchId: string;
  latest: string | null;
  sequence: number;
  intervalMs: number;
  updatedAtMs: number;
}

export function createInitialManifest(
  matchId: string,
  intervalMs: number,
): ShelbyManifest {
  return {
    matchId,
    latest: null,
    sequence: 0,
    intervalMs,
    updatedAtMs: Date.now(),
  };
}

export function buildSegmentPath(
  matchId: string,
  timestampMs: number,
  sequence: number,
): string {
  const date = new Date(timestampMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const seq = String(sequence).padStart(6, "0");
  return `candles/${matchId}/${year}${month}${day}/${hour}/${seq}.jsonl`;
}

export function latestPath(matchId: string): string {
  return `candles/${matchId}/latest.jsonl`;
}

export function manifestPath(matchId: string): string {
  return `candles/${matchId}/manifest.json`;
}
