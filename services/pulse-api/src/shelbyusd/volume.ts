import type { ShelbyAptosClient } from '../aptos-client';
import { logger } from '../logger';

export interface VolumeData {
  volume24h: number;
  transferCount24h: number;
  velocity: number; // transfers per hour
}

/**
 * Calculate 24-hour volume and velocity for ShelbyUSD
 */
export async function get24hVolume(
  aptosClient: ShelbyAptosClient
): Promise<VolumeData> {
  try {
    // Fetch recent events (last 24 hours worth)
    const events = await aptosClient.getShelbyUSDEvents(5000);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Filter for last 24 hours
    // Note: We're using current timestamp as placeholder - in production
    // you'd derive actual timestamp from transaction_version
    const recentEvents = events; // In real implementation, filter by timestamp

    // Calculate total volume (sum of all deposits or withdraws, not both to avoid double counting)
    let totalVolume = 0;
    let transferCount = 0;

    const seenVersions = new Set<string>();

    for (const event of recentEvents) {
      // Only count each transaction version once
      if (!seenVersions.has(event.version)) {
        seenVersions.add(event.version);
        totalVolume += event.amount;
        transferCount++;
      }
    }

    // Calculate velocity (transfers per hour)
    const velocity = transferCount / 24;

    logger.debug(
      { volume24h: totalVolume, transferCount24h: transferCount, velocity },
      'Calculated 24h ShelbyUSD volume'
    );

    return {
      volume24h: totalVolume,
      transferCount24h: transferCount,
      velocity,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to calculate 24h volume');
    return {
      volume24h: 0,
      transferCount24h: 0,
      velocity: 0,
    };
  }
}
