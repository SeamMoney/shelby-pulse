import type { ShelbyAptosClient, ShelbyUSDEvent } from '../aptos-client';
import { logger } from '../logger';

export interface LeaderboardEntry {
  address: string;
  balance: number;
  barWidth: number; // 0-20 for ASCII bar visualization
}

/**
 * Get top ShelbyUSD holders by aggregating deposit/withdraw events
 */
export async function getShelbyUSDLeaderboard(
  aptosClient: ShelbyAptosClient,
  limit = 20
): Promise<LeaderboardEntry[]> {
  try {
    // Fetch all ShelbyUSD events
    const events = await aptosClient.getShelbyUSDEvents(10000);

    // Aggregate balances by account
    const balances = new Map<string, number>();

    for (const event of events) {
      const currentBalance = balances.get(event.account) || 0;
      if (event.type === 'deposit') {
        balances.set(event.account, currentBalance + event.amount);
      } else {
        balances.set(event.account, currentBalance - event.amount);
      }
    }

    // Convert to array and sort by balance
    const entries = Array.from(balances.entries())
      .map(([address, balance]) => ({ address, balance }))
      .filter(entry => entry.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    // Calculate bar widths for ASCII visualization
    const maxBalance = entries.length > 0 ? entries[0].balance : 1;
    const leaderboard = entries.map(entry => ({
      address: entry.address,
      balance: entry.balance,
      barWidth: Math.max(1, Math.floor((entry.balance / maxBalance) * 20)),
    }));

    logger.debug(
      { totalAccounts: balances.size, topHolders: leaderboard.length },
      'Generated ShelbyUSD leaderboard'
    );

    return leaderboard;
  } catch (error) {
    logger.error({ error }, 'Failed to generate ShelbyUSD leaderboard');
    return [];
  }
}
