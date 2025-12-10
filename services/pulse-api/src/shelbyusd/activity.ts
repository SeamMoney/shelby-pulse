import type { ShelbyAptosClient } from '../aptos-client';
import { logger } from '../logger';

export interface ActivityEntry {
  address: string;
  txCount: number;
  barWidth: number;
}

export interface SpenderEntry {
  address: string;
  totalSpent: number;
  barWidth: number;
}

export interface RecentTransaction {
  address: string;
  type: 'deposit' | 'withdraw' | 'mint' | 'burn';
  amount: number;
  version: number;
}

export interface MinterEntry {
  address: string;
  totalMinted: number;
  mintCount: number;
  barWidth: number;
}

// Cache for all-time activity stats (expensive to compute, stable data)
let cachedActivities: Array<{
  owner: string;
  type: 'deposit' | 'withdraw' | 'mint' | 'burn';
  amount: number;
  version: string;
}> | null = null;
let cacheTimestamp = 0;
const ACTIVITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - all-time stats don't change fast

/**
 * Get cached activities or fetch fresh data
 * This ensures consistent all-time stats across requests
 */
async function getCachedActivities(aptosClient: ShelbyAptosClient, forceRefresh = false): Promise<typeof cachedActivities> {
  const now = Date.now();

  // Return cached data if still valid (and not forcing refresh)
  if (!forceRefresh && cachedActivities && (now - cacheTimestamp) < ACTIVITY_CACHE_TTL_MS) {
    return cachedActivities;
  }

  // Fetch ALL activities for accurate all-time stats
  // This is expensive but cached for 5 minutes
  logger.info('Fetching all ShelbyUSD activities (cache expired or empty)');
  cachedActivities = await aptosClient.getShelbyUSDActivities(100000);
  cacheTimestamp = now;

  return cachedActivities;
}

/**
 * Clear the activity cache (call after farming completes to refresh leaderboards)
 */
export function clearActivityCache(): void {
  cachedActivities = null;
  cacheTimestamp = 0;
  logger.info('Activity cache cleared');
}

/**
 * Get most active ShelbyUSD users by transaction count
 * Uses cached all-time activity data for consistent results
 */
export async function getMostActiveUsers(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<ActivityEntry[]> {
  try {
    const activities = await getCachedActivities(aptosClient);
    if (!activities) return [];

    // Count transactions per address
    const txCounts = new Map<string, number>();

    for (const activity of activities) {
      const count = txCounts.get(activity.owner) || 0;
      txCounts.set(activity.owner, count + 1);
    }

    // Convert to array and sort
    const entries = Array.from(txCounts.entries())
      .map(([address, txCount]) => ({ address, txCount }))
      .sort((a, b) => b.txCount - a.txCount)
      .slice(0, limit);

    // Calculate bar widths
    const maxCount = entries.length > 0 ? entries[0].txCount : 1;
    return entries.map(entry => ({
      address: entry.address,
      txCount: entry.txCount,
      barWidth: Math.max(1, Math.floor((entry.txCount / maxCount) * 20)),
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to get most active users');
    return [];
  }
}

/**
 * Get biggest ShelbyUSD spenders by total withdraw amount
 * Uses cached all-time activity data for consistent results
 */
export async function getBiggestSpenders(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<SpenderEntry[]> {
  try {
    const activities = await getCachedActivities(aptosClient);
    if (!activities) return [];

    // Sum withdrawals per address
    const withdrawals = new Map<string, number>();

    for (const activity of activities) {
      if (activity.type === 'withdraw') {
        const current = withdrawals.get(activity.owner) || 0;
        withdrawals.set(activity.owner, current + activity.amount);
      }
    }

    // Convert to array and sort
    const entries = Array.from(withdrawals.entries())
      .map(([address, totalSpent]) => ({ address, totalSpent }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit);

    // Calculate bar widths
    const maxSpent = entries.length > 0 ? entries[0].totalSpent : 1;
    return entries.map(entry => ({
      address: entry.address,
      totalSpent: entry.totalSpent,
      barWidth: Math.max(1, Math.floor((entry.totalSpent / maxSpent) * 20)),
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to get biggest spenders');
    return [];
  }
}

/**
 * Get top ShelbyUSD minters (airdrop eligible addresses)
 * Uses cached all-time activity data for consistent results
 */
export async function getTopMinters(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<MinterEntry[]> {
  try {
    const activities = await getCachedActivities(aptosClient);
    if (!activities) return [];

    // Sum mints per address
    const mints = new Map<string, { totalMinted: number; mintCount: number }>();

    for (const activity of activities) {
      if (activity.type === 'mint') {
        const current = mints.get(activity.owner) || { totalMinted: 0, mintCount: 0 };
        mints.set(activity.owner, {
          totalMinted: current.totalMinted + activity.amount,
          mintCount: current.mintCount + 1,
        });
      }
    }

    // Convert to array and sort by total minted
    const entries = Array.from(mints.entries())
      .map(([address, data]) => ({ address, ...data }))
      .sort((a, b) => b.totalMinted - a.totalMinted)
      .slice(0, limit);

    // Calculate bar widths
    const maxMinted = entries.length > 0 ? entries[0].totalMinted : 1;
    return entries.map(entry => ({
      address: entry.address,
      totalMinted: entry.totalMinted,
      mintCount: entry.mintCount,
      barWidth: Math.max(1, Math.floor((entry.totalMinted / maxMinted) * 20)),
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to get top minters');
    return [];
  }
}

/**
 * Get recent ShelbyUSD transactions
 */
export async function getRecentTransactions(
  aptosClient: ShelbyAptosClient,
  limit = 20
): Promise<RecentTransaction[]> {
  try {
    const activities = await aptosClient.getShelbyUSDActivities(limit);

    return activities.map(activity => ({
      address: activity.owner,
      type: activity.type,
      amount: activity.amount,
      version: parseInt(activity.version),
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to get recent transactions');
    return [];
  }
}
