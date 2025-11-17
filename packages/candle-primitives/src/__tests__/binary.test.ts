import { describe, expect, test } from "vitest";
import { packCandleBatch, unpackCandleBatch } from "../binary.ts";
import type { NormalizedCandle } from "../types.ts";

const fixtureCandles: NormalizedCandle[] = [
  {
    timestampMs: 1_734_009_000_000,
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 12_500,
  },
  {
    timestampMs: 1_734_009_000_065,
    open: 104,
    high: 106,
    low: 101,
    close: 103,
    volume: 10_250,
  },
  {
    timestampMs: 1_734_009_000_130,
    open: 103,
    high: 108,
    low: 102,
    close: 107,
    volume: 9_750,
  },
];

describe("binary packing", () => {
  test("round-trips candle batch", () => {
    const buffer = packCandleBatch(
      { sequence: 42, intervalMs: 65, sentAtMs: 1_734_009_000_200 },
      fixtureCandles,
    );
    const { metadata, candles } = unpackCandleBatch(buffer);

    expect(metadata.sequence).toBe(42);
    expect(metadata.intervalMs).toBe(65);
    expect(metadata.baseTimestampMs).toBe(fixtureCandles[0].timestampMs);
    expect(metadata.sentAtMs).toBe(1_734_009_000_200);
    expect(candles).toEqual(fixtureCandles);
  });

  test("rejects empty batch", () => {
    expect(() => packCandleBatch({}, [])).toThrow(/empty/);
  });
});
