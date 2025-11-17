export interface NormalizedCandle {
  /**
   * Absolute timestamp in milliseconds since epoch.
   */
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleBatchMetadata {
  version: number;
  intervalMs: number;
  baseTimestampMs: number;
  sentAtMs: number;
  sequence: number;
}

export interface PackedBatch {
  metadata: CandleBatchMetadata;
  candles: NormalizedCandle[];
}

export const DEFAULT_BATCH_VERSION = 1;
