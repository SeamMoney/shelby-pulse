#!/usr/bin/env npx tsx

/**
 * ShelbyUSD Faucet Farming Bot
 *
 * Automates requesting ShelbyUSD tokens from the faucet.
 *
 * Usage:
 *   npx tsx scripts/shelbyusd-faucet-bot.ts --address 0x234d7b83de4997067afee6e0ae2f47a28636419c0e3fbe9dddcd8ca4c230f9dc
 *   npx tsx scripts/shelbyusd-faucet-bot.ts --address 0x... --interval 60 --count 10
 */

const FAUCET_URL = "https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd";
const DEFAULT_AMOUNT = 1000000000; // 10 ShelbyUSD (8 decimals)
const DEFAULT_INTERVAL_SECONDS = 30;
const DEFAULT_COUNT = Infinity;

interface FaucetResponse {
  txn_hashes: string[];
}

interface FaucetError {
  error?: string;
  message?: string;
}

async function requestFaucet(address: string, amount: number = DEFAULT_AMOUNT): Promise<FaucetResponse> {
  const response = await fetch(FAUCET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "*/*",
      "Origin": "https://docs.shelby.xyz",
      "Referer": "https://docs.shelby.xyz/",
    },
    body: JSON.stringify({ address, amount }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Faucet request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

function formatAmount(amount: number): string {
  return (amount / 1e8).toFixed(2);
}

function parseArgs(): { address: string; interval: number; count: number; amount: number } {
  const args = process.argv.slice(2);
  let address = "";
  let interval = DEFAULT_INTERVAL_SECONDS;
  let count = DEFAULT_COUNT;
  let amount = DEFAULT_AMOUNT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address" || args[i] === "-a") {
      address = args[++i];
    } else if (args[i] === "--interval" || args[i] === "-i") {
      interval = parseInt(args[++i], 10);
    } else if (args[i] === "--count" || args[i] === "-c") {
      count = parseInt(args[++i], 10);
    } else if (args[i] === "--amount") {
      amount = parseInt(args[++i], 10);
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
ShelbyUSD Faucet Farming Bot

Usage:
  npx tsx scripts/shelbyusd-faucet-bot.ts --address <APTOS_ADDRESS> [options]

Options:
  --address, -a    Aptos address to fund (required)
  --interval, -i   Seconds between requests (default: ${DEFAULT_INTERVAL_SECONDS})
  --count, -c      Number of requests to make (default: infinite)
  --amount         Amount in smallest units (default: ${DEFAULT_AMOUNT} = ${formatAmount(DEFAULT_AMOUNT)} SHELBY_USD)
  --help, -h       Show this help message

Examples:
  npx tsx scripts/shelbyusd-faucet-bot.ts --address 0x234d...0f9dc
  npx tsx scripts/shelbyusd-faucet-bot.ts --address 0x234d...0f9dc --interval 60 --count 10
`);
      process.exit(0);
    }
  }

  if (!address) {
    console.error("Error: --address is required");
    console.error("Run with --help for usage information");
    process.exit(1);
  }

  return { address, interval, count, amount };
}

async function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main() {
  const { address, interval, count, amount } = parseArgs();

  console.log(`
╔════════════════════════════════════════════════════════════╗
║           ShelbyUSD Faucet Farming Bot                     ║
╠════════════════════════════════════════════════════════════╣
║  Address:  ${address.slice(0, 10)}...${address.slice(-8)}                          ║
║  Amount:   ${formatAmount(amount)} SHELBY_USD per request                  ║
║  Interval: ${interval} seconds                                     ║
║  Count:    ${count === Infinity ? "∞ (infinite)" : count}                                        ║
╚════════════════════════════════════════════════════════════╝
`);

  let successCount = 0;
  let failCount = 0;
  let totalFarmed = 0;

  for (let i = 1; i <= count; i++) {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] Request #${i}...`);

    try {
      const result = await requestFaucet(address, amount);
      successCount++;
      totalFarmed += amount;

      console.log(`  ✓ Success! Tx: ${result.txn_hashes[0]}`);
      console.log(`  ✓ Explorer: https://explorer.aptoslabs.com/txn/${result.txn_hashes[0]}?network=shelbynet`);
      console.log(`  📊 Total farmed: ${formatAmount(totalFarmed)} SHELBY_USD (${successCount} successful, ${failCount} failed)`);
    } catch (error) {
      failCount++;
      console.log(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  📊 Stats: ${successCount} successful, ${failCount} failed`);
    }

    if (i < count) {
      console.log(`  ⏳ Waiting ${interval} seconds...`);
      await sleep(interval);
    }
  }

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                     Farming Complete!                       ║
╠════════════════════════════════════════════════════════════╣
║  Total Farmed:  ${formatAmount(totalFarmed).padEnd(10)} SHELBY_USD                   ║
║  Successful:    ${String(successCount).padEnd(10)}                              ║
║  Failed:        ${String(failCount).padEnd(10)}                              ║
╚════════════════════════════════════════════════════════════╝
`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
