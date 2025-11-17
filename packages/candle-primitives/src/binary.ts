import {
  type CandleBatchMetadata,
  DEFAULT_BATCH_VERSION,
  type NormalizedCandle,
  type PackedBatch,
} from "./types.ts";

const HEADER_BYTES = 32;
const CANDLE_BYTES = 24;

export function getBatchByteLength(candleCount: number): number {
  return HEADER_BYTES + candleCount * CANDLE_BYTES;
}

export function packCandleBatch(
  metadata: Partial<CandleBatchMetadata>,
  candles: NormalizedCandle[],
): ArrayBuffer {
  if (candles.length === 0) {
    throw new Error("Cannot pack empty candle batch");
  }

  const baseTimestampMs = metadata.baseTimestampMs ?? candles[0].timestampMs;
  const resolvedMetadata: CandleBatchMetadata = {
    version: metadata.version ?? DEFAULT_BATCH_VERSION,
    intervalMs: metadata.intervalMs ?? inferInterval(candles),
    baseTimestampMs,
    sentAtMs: metadata.sentAtMs ?? Date.now(),
    sequence: metadata.sequence ?? 0,
  };

  if (!Number.isInteger(resolvedMetadata.intervalMs)) {
    throw new Error("intervalMs must be an integer");
  }

  const buffer = new ArrayBuffer(getBatchByteLength(candles.length));
  const view = new DataView(buffer);

  // Header
  view.setUint16(0, resolvedMetadata.version, true);
  view.setUint16(2, candles.length, true);
  view.setUint32(4, resolvedMetadata.intervalMs, true);
  view.setFloat64(8, resolvedMetadata.baseTimestampMs, true);
  view.setFloat64(16, resolvedMetadata.sentAtMs, true);
  view.setUint32(24, resolvedMetadata.sequence, true);
  view.setUint32(28, 0, true); // reserved for future use

  let offset = HEADER_BYTES;
  let prevTimestamp = candles[0].timestampMs;

  candles.forEach((candle, index) => {
    const delta =
      index === 0 ? 0 : Math.trunc(candle.timestampMs - prevTimestamp);
    view.setInt32(offset, delta, true);
    view.setFloat32(offset + 4, candle.open, true);
    view.setFloat32(offset + 8, candle.high, true);
    view.setFloat32(offset + 12, candle.low, true);
    view.setFloat32(offset + 16, candle.close, true);
    view.setFloat32(offset + 20, candle.volume, true);
    offset += CANDLE_BYTES;
    prevTimestamp = candle.timestampMs;
  });

  return buffer;
}

export function unpackCandleBatch(buffer: ArrayBuffer): PackedBatch {
  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error("Buffer too small to contain batch header");
  }

  const view = new DataView(buffer);
  const version = view.getUint16(0, true);
  const candleCount = view.getUint16(2, true);
  const intervalMs = view.getUint32(4, true);
  const baseTimestampMs = view.getFloat64(8, true);
  const sentAtMs = view.getFloat64(16, true);
  const sequence = view.getUint32(24, true);

  const expectedLength = getBatchByteLength(candleCount);
  if (buffer.byteLength !== expectedLength) {
    throw new Error(
      `Unexpected buffer length. Expected ${expectedLength}, received ${buffer.byteLength}`,
    );
  }

  let offset = HEADER_BYTES;
  let currentTimestamp = baseTimestampMs;
  const candles: NormalizedCandle[] = [];

  for (let i = 0; i < candleCount; i += 1) {
    const delta = view.getInt32(offset, true);
    if (i > 0) {
      currentTimestamp += delta;
    }
    candles.push({
      timestampMs: currentTimestamp,
      open: view.getFloat32(offset + 4, true),
      high: view.getFloat32(offset + 8, true),
      low: view.getFloat32(offset + 12, true),
      close: view.getFloat32(offset + 16, true),
      volume: view.getFloat32(offset + 20, true),
    });
    offset += CANDLE_BYTES;
  }

  const metadata: CandleBatchMetadata = {
    version,
    intervalMs,
    baseTimestampMs,
    sentAtMs,
    sequence,
  };

  return { metadata, candles };
}

function inferInterval(candles: NormalizedCandle[]): number {
  if (candles.length < 2) {
    return 65;
  }

  const deltaSum = candles
    .slice(1)
    .reduce(
      (accumulator, candle, index) =>
        accumulator + (candle.timestampMs - candles[index].timestampMs),
      0,
    );

  return Math.round(deltaSum / (candles.length - 1));
}
