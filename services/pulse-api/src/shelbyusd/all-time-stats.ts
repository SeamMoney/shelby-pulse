import type { ShelbyAptosClient } from '../aptos-client';
import { logger } from '../logger';

export interface AllTimeStats {
  totalSupply: number; // Total ShelbyUSD in circulation
  totalHolders: number; // Number of addresses holding ShelbyUSD
  totalTransactions: number; // All-time transaction count
  totalVolume: number; // All-time volume (sum of all transfers)
  averageTransactionSize: number; // Average amount per transaction
  firstTransactionVersion: string; // Earliest transaction on ShelbyNet
  lastTransactionVersion: string; // Most recent transaction
}

/**
 * Get comprehensive all-time statistics for ShelbyUSD on ShelbyNet
 * Shows value accrual from network inception
 */
export async function getAllTimeStats(
  aptosClient: ShelbyAptosClient
): Promise<AllTimeStats> {
  try {
    // Fetch balances and recent activities to calculate stats
    // Limit activities to 10k for performance (takes ~100 API calls instead of 1000)
    const [balances, activities] = await Promise.all([
      aptosClient.getShelbyUSDBalances(10000),
      aptosClient.getShelbyUSDActivities(10000),
    ]);

    // Calculate total supply (sum of all balances)
    const totalSupply = balances.reduce((sum, b) => sum + b.balance, 0);

    // Count unique holders
    const totalHolders = balances.filter(b => b.balance > 0).length;

    // Total transactions
    const totalTransactions = activities.length;

    // Calculate total volume
    // Count each transfer once (use Set to deduplicate by version)
    const uniqueTransfers = new Map<string, number>();
    for (const activity of activities) {
      if (!uniqueTransfers.has(activity.version)) {
        uniqueTransfers.set(activity.version, activity.amount);
      }
    }
    const totalVolume = Array.from(uniqueTransfers.values()).reduce((sum, amt) => sum + amt, 0);

    // Average transaction size
    const averageTransactionSize = totalTransactions > 0 ? totalVolume / totalTransactions : 0;

    // First and last transaction versions
    const sortedActivities = [...activities].sort((a, b) =>
      parseInt(a.version) - parseInt(b.version)
    );
    const firstTransactionVersion = sortedActivities[0]?.version || '0';
    const lastTransactionVersion = sortedActivities[sortedActivities.length - 1]?.version || '0';

    logger.info(
      {
        totalSupply,
        totalHolders,
        totalTransactions,
        totalVolume,
        averageTransactionSize,
      },
      'Calculated all-time ShelbyUSD stats since ShelbyNet inception'
    );

    return {
      totalSupply,
      totalHolders,
      totalTransactions,
      totalVolume,
      averageTransactionSize,
      firstTransactionVersion,
      lastTransactionVersion,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to calculate all-time stats');
    return {
      totalSupply: 0,
      totalHolders: 0,
      totalTransactions: 0,
      totalVolume: 0,
      averageTransactionSize: 0,
      firstTransactionVersion: '0',
      lastTransactionVersion: '0',
    };
  }
}
