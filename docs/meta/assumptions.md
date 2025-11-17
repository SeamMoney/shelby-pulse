# Candlestick Fast Path – Working Notes

## Known Inputs
- Shelby SDK: `@shelby-protocol/sdk` (Node + browser variants available in references).
- Manifest layout target: `candles/<matchId>/<YYYYMMDD>/<HH>/<seq>.jsonl`, rolling `latest.jsonl`, and `manifest.json`.
- Frame contract goal: 65 ms cadence, 24-byte payload per candle (int32 delta + float32 ohlcv).
- Explorer base URL (assumption): `https://explorer.shelby.xyz/tx/<txId>`.

## Open Questions
1. Confirm Shelby sandbox endpoints vs. production hosts.
2. Determine external historic feed (Binance? Shelby-provided?). Interim plan uses CSV/AlphaVantage.
3. Validate required headers/metadata for Shelby blob uploads (content type, TTL limits).
4. Decide auth model for dev WS (tokenless) vs. prod (bearer?).
5. Confirm whether explorer links need environment awareness (testnet vs. mainnet).

## Immediate TODOs
- Wire environment template for producer + frontend.
- Implement shared candle contract package with binary codecs + manifest helpers.
- Stand up Node producer skeleton (WS broadcast + Shelby upload stub).
- Scaffold Vite frontend and integrate q5 rendering hook.
