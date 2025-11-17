import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRandomTickGenerator } from "../../services/producer/src/tickSource/random.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const intervalMs = Number(process.env.INTERVAL_MS ?? 65);
  const count = Number(process.env.COUNT ?? 1024);
  const generator = createRandomTickGenerator({ intervalMs });
  const candles = Array.from({ length: count }, () => generator());
  const outPath = path.resolve(__dirname, "../../data/staged/random-seed.jsonl");
  const body = candles.map((candle) => JSON.stringify(candle)).join("\n");
  await writeFile(outPath, body);
  process.stdout.write(`wrote ${candles.length} candles to ${outPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
