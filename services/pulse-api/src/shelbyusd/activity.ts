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
  type: 'deposit' | 'withdraw';
  amount: number;
  version: number;
}

/**
 * Get most active ShelbyUSD users by transaction count
 * Fetches ALL historical data from ShelbyNet inception
 */
export async function getMostActiveUsers(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<ActivityEntry[]> {
  try {
    // Fetch ALL activities since ShelbyNet inception (no limit)
    const activities = await aptosClient.getShelbyUSDActivities(100000);

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
 * Fetches ALL historical data from ShelbyNet inception
 */
export async function getBiggestSpenders(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<SpenderEntry[]> {
  try {
    // Fetch ALL activities since ShelbyNet inception (no limit)
    const activities = await aptosClient.getShelbyUSDActivities(100000);

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
