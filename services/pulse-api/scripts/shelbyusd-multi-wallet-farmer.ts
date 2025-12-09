#!/usr/bin/env npx tsx

/**
 * ShelbyUSD Multi-Wallet Farming Bot
 *
 * Creates multiple Aptos accounts and farms ShelbyUSD to each.
 * Since ShelbyUSD has the Untransferable flag, each wallet accumulates independently.
 *
 * Usage:
 *   npx tsx scripts/shelbyusd-multi-wallet-farmer.ts --generate 5
 *   npx tsx scripts/shelbyusd-multi-wallet-farmer.ts --farm
 *   npx tsx scripts/shelbyusd-multi-wallet-farmer.ts --status
 */

import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import * as fs from "fs";
import * as path from "path";

const FAUCET_URL = "https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd";
const DEFAULT_AMOUNT = 1000000000; // 10 ShelbyUSD (8 decimals)
const REQUESTS_PER_DAY = 50;
const WALLETS_FILE = path.join(process.cwd(), "scripts", ".shelbyusd-wallets.json");

interface WalletInfo {
  address: string;
  privateKey: string;
  createdAt: string;
  totalFarmed: number;
  lastFarmedAt: string | null;
  todayRequests: number;
  lastResetDate: string;
}

interface WalletsData {
  wallets: WalletInfo[];
  mainWallet?: string; // For future aggregation if transfers become possible
}

interface FaucetResponse {
  txn_hashes: string[];
}

function loadWallets(): WalletsData {
  if (fs.existsSync(WALLETS_FILE)) {
    return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8"));
  }
  return { wallets: [] };
}

function saveWallets(data: WalletsData): void {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
}

function generateWallet(): WalletInfo {
  const account = Account.generate();
  const privateKeyHex = account.privateKey.toString();

  return {
    address: account.accountAddress.toString(),
    privateKey: privateKeyHex,
    createdAt: new Date().toISOString(),
    totalFarmed: 0,
    lastFarmedAt: null,
    todayRequests: 0,
    lastResetDate: new Date().toISOString().split("T")[0],
  };
}

async function requestFaucet(address: string, amount: number = DEFAULT_AMOUNT): Promise<FaucetResponse> {
  const response = await fetch(FAUCET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://docs.shelby.xyz",
      Referer: "https://docs.shelby.xyz/",
    },
    body: JSON.stringify({ address, amount }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.rejection_reasons?.[0]?.reason || `HTTP ${response.status}`);
  }

  return data;
}

function formatAmount(amount: number): string {
  return (amount / 1e8).toFixed(2);
}

function resetDailyCountsIfNeeded(wallet: WalletInfo): void {
  const today = new Date().toISOString().split("T")[0];
  if (wallet.lastResetDate !== today) {
    wallet.todayRequests = 0;
    wallet.lastResetDate = today;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWallets(count: number): Promise<void> {
  const data = loadWallets();

  console.log(`\n🔐 Generating ${count} new wallets...\n`);

  for (let i = 0; i < count; i++) {
    const wallet = generateWallet();
    data.wallets.push(wallet);
    console.log(`  ${i + 1}. ${wallet.address}`);
  }

  saveWallets(data);
  console.log(`\n✅ Generated ${count} wallets. Total: ${data.wallets.length}`);
  console.log(`📁 Saved to: ${WALLETS_FILE}`);
  console.log(`\n⚠️  IMPORTANT: Back up this file! It contains private keys.`);
}

async function farmAllWallets(requestsPerWallet: number = REQUESTS_PER_DAY): Promise<void> {
  const data = loadWallets();

  if (data.wallets.length === 0) {
    console.log("❌ No wallets found. Run with --generate first.");
    return;
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         ShelbyUSD Multi-Wallet Farming Bot                     ║
╠════════════════════════════════════════════════════════════════╣
║  Wallets:           ${String(data.wallets.length).padEnd(38)}║
║  Requests/wallet:   ${String(requestsPerWallet).padEnd(38)}║
║  Amount/request:    ${(formatAmount(DEFAULT_AMOUNT) + " SHELBY_USD").padEnd(38)}║
╚════════════════════════════════════════════════════════════════╝
`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalFarmedThisSession = 0;

  for (let wi = 0; wi < data.wallets.length; wi++) {
    const wallet = data.wallets[wi];
    resetDailyCountsIfNeeded(wallet);

    const remainingToday = REQUESTS_PER_DAY - wallet.todayRequests;
    const requestsToMake = Math.min(requestsPerWallet, remainingToday);

    if (requestsToMake <= 0) {
      console.log(`\n[Wallet ${wi + 1}/${data.wallets.length}] ${wallet.address.slice(0, 10)}...`);
      console.log(`  ⏭️  Already hit daily limit (${wallet.todayRequests}/${REQUESTS_PER_DAY})`);
      continue;
    }

    console.log(`\n[Wallet ${wi + 1}/${data.wallets.length}] ${wallet.address.slice(0, 10)}...${wallet.address.slice(-6)}`);
    console.log(`  📊 Today: ${wallet.todayRequests}/${REQUESTS_PER_DAY} | Total: ${formatAmount(wallet.totalFarmed)} SHELBY_USD`);
    console.log(`  🎯 Making ${requestsToMake} requests...`);

    let walletSuccess = 0;
    let walletFailed = 0;

    for (let i = 0; i < requestsToMake; i++) {
      try {
        const result = await requestFaucet(wallet.address);
        walletSuccess++;
        totalSuccess++;
        wallet.todayRequests++;
        wallet.totalFarmed += DEFAULT_AMOUNT;
        wallet.lastFarmedAt = new Date().toISOString();
        totalFarmedThisSession += DEFAULT_AMOUNT;

        if (i === 0 || (i + 1) % 10 === 0 || i === requestsToMake - 1) {
          console.log(`  ✓ Request ${i + 1}/${requestsToMake} - Tx: ${result.txn_hashes[0]?.slice(0, 16)}...`);
        }
      } catch (error) {
        walletFailed++;
        totalFailed++;
        const msg = error instanceof Error ? error.message : String(error);

        if (msg.includes("UsageLimitExhausted") || msg.includes("maximum allowed")) {
          console.log(`  ⚠️  Daily limit reached at request ${i + 1}`);
          wallet.todayRequests = REQUESTS_PER_DAY; // Mark as exhausted
          break;
        } else {
          console.log(`  ✗ Request ${i + 1} failed: ${msg.slice(0, 60)}`);
        }
      }

      // Small delay between requests to avoid rate limiting
      if (i < requestsToMake - 1) {
        await sleep(500);
      }
    }

    console.log(`  📈 Session: +${walletSuccess} success, ${walletFailed} failed`);

    // Save progress after each wallet
    saveWallets(data);

    // Delay between wallets
    if (wi < data.wallets.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                     Farming Session Complete!                  ║
╠════════════════════════════════════════════════════════════════╣
║  This Session:      +${(formatAmount(totalFarmedThisSession) + " SHELBY_USD").padEnd(36)}║
║  Successful:        ${String(totalSuccess).padEnd(38)}║
║  Failed:            ${String(totalFailed).padEnd(38)}║
╚════════════════════════════════════════════════════════════════╝
`);
}

async function showStatus(): Promise<void> {
  const data = loadWallets();

  if (data.wallets.length === 0) {
    console.log("❌ No wallets found. Run with --generate first.");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  let totalFarmed = 0;
  let totalAvailableToday = 0;

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   ShelbyUSD Wallet Status                      ║
╚════════════════════════════════════════════════════════════════╝
`);

  console.log("  #   Address                            Total        Today");
  console.log("  ─────────────────────────────────────────────────────────────");

  for (let i = 0; i < data.wallets.length; i++) {
    const wallet = data.wallets[i];
    resetDailyCountsIfNeeded(wallet);

    const remaining = REQUESTS_PER_DAY - wallet.todayRequests;
    totalFarmed += wallet.totalFarmed;
    totalAvailableToday += remaining;

    const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`;
    const totalStr = formatAmount(wallet.totalFarmed).padStart(10);
    const todayStr = `${wallet.todayRequests}/${REQUESTS_PER_DAY}`.padStart(8);

    console.log(`  ${String(i + 1).padStart(2)}  ${shortAddr}     ${totalStr} SHELBY   ${todayStr}`);
  }

  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Total Wallets:     ${String(data.wallets.length).padEnd(38)}║
║  Total Farmed:      ${(formatAmount(totalFarmed) + " SHELBY_USD").padEnd(38)}║
║  Available Today:   ${(String(totalAvailableToday) + " requests remaining").padEnd(38)}║
╚════════════════════════════════════════════════════════════════╝
`);

  console.log(`\n📋 Full addresses for leaderboard verification:`);
  for (const wallet of data.wallets) {
    if (wallet.totalFarmed > 0) {
      console.log(`   ${wallet.address} - ${formatAmount(wallet.totalFarmed)} SHELBY_USD`);
    }
  }
}

async function exportAddresses(): Promise<void> {
  const data = loadWallets();
  console.log("\n📋 Wallet addresses (for import into other tools):\n");
  for (const wallet of data.wallets) {
    console.log(wallet.address);
  }
}

function printHelp(): void {
  console.log(`
ShelbyUSD Multi-Wallet Farming Bot

Usage:
  npx tsx scripts/shelbyusd-multi-wallet-farmer.ts [command] [options]

Commands:
  --generate, -g <count>   Generate new wallets
  --farm, -f               Farm all wallets (50 requests each per day)
  --farm-quick             Farm just 1 request per wallet (for testing)
  --status, -s             Show wallet balances and status
  --export, -e             Export all wallet addresses
  --help, -h               Show this help

Examples:
  # Generate 10 new wallets
  npx tsx scripts/shelbyusd-multi-wallet-farmer.ts --generate 10

  # Farm all wallets to their daily limit
  npx tsx scripts/shelbyusd-multi-wallet-farmer.ts --farm

  # Check status of all wallets
  npx tsx scripts/shelbyusd-multi-wallet-farmer.ts --status

Notes:
  - Each wallet is limited to 50 faucet requests per day
  - Wallets are saved to: ${WALLETS_FILE}
  - Private keys are stored - BACK UP THIS FILE!
  - ShelbyUSD has the Untransferable flag - tokens cannot be moved between wallets
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--generate") || args.includes("-g")) {
    const idx = args.indexOf("--generate") !== -1 ? args.indexOf("--generate") : args.indexOf("-g");
    const count = parseInt(args[idx + 1], 10) || 5;
    await generateWallets(count);
    return;
  }

  if (args.includes("--farm") || args.includes("-f")) {
    await farmAllWallets(REQUESTS_PER_DAY);
    return;
  }

  if (args.includes("--farm-quick")) {
    await farmAllWallets(1);
    return;
  }

  if (args.includes("--status") || args.includes("-s")) {
    await showStatus();
    return;
  }

  if (args.includes("--export") || args.includes("-e")) {
    await exportAddresses();
    return;
  }

  console.log("Unknown command. Run with --help for usage.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
