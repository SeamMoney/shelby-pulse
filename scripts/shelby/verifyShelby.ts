import { ShelbyNodeClient } from "@shelby-protocol/sdk/node";

async function main() {
  const apiKey = process.env.SHELBY_API_KEY;
  const account = process.env.SHELBY_ACCOUNT_ADDRESS;
  const matchId = process.env.MATCH_ID;

  if (!apiKey || !account || !matchId) {
    throw new Error("Missing SHELBY_API_KEY, SHELBY_ACCOUNT_ADDRESS, or MATCH_ID env");
  }

  const client = new ShelbyNodeClient({ apiKey });
  const manifestPath = `candles/${matchId}/manifest.json`;
  const manifest = await client.blob.fetchJson(manifestPath);

  console.log(JSON.stringify({ manifest }, null, 2));
}

main().catch((error) => {
  console.error("Shelby verification failed", error);
  process.exit(1);
});
