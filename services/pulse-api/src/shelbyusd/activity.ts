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

/**
 * Get most active ShelbyUSD users by transaction count
 * Limited to recent activities for efficiency at scale
 */
export async function getMostActiveUsers(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<ActivityEntry[]> {
  try {
    // Limit to 10,000 activities for efficiency (90% cost reduction)
    const activities = await aptosClient.getShelbyUSDActivities(10000);

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
 * Limited to recent activities for efficiency at scale
 */
export async function getBiggestSpenders(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<SpenderEntry[]> {
  try {
    // Limit to 10,000 activities for efficiency (90% cost reduction)
    const activities = await aptosClient.getShelbyUSDActivities(10000);

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
 * Tracks who has minted the most ShelbyUSD on ShelbyNet
 */
export async function getTopMinters(
  aptosClient: ShelbyAptosClient,
  limit = 10
): Promise<MinterEntry[]> {
  try {
    // Limit to 10,000 activities for efficiency (90% cost reduction)
    const activities = await aptosClient.getShelbyUSDActivities(10000);

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
