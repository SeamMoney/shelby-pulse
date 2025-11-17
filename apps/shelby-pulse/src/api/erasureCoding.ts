import type { StorageProviderData, BlobRegisteredEvent } from './aptos';

export interface ErasureCodingEfficiency {
  theoreticalOverhead: number; // e.g., 1.6x for n=16, k=10
  actualOverhead: number;
  efficiency: number; // percentage (100% = perfect)
  wastedStorage: number; // in GB
  totalLogicalData: number; // in GB
  totalPhysicalStorage: number; // in GB
}

/**
 * Calculate how efficiently erasure coding is being used
 */
export function calculateErasureCodingEfficiency(
  providers: StorageProviderData[],
  _blobs: BlobRegisteredEvent[]
): ErasureCodingEfficiency {
  // Clay encoding: n=16 total shards, k=10 data shards
  // Theoretical overhead: n/k = 16/10 = 1.6x
  const theoreticalOverhead = 16 / 10;

  // Calculate total logical data from blobs
  // For simplicity, assume each chunkset is 64KB
  const CHUNKSET_SIZE_BYTES = 64 * 1024;

  const totalChunksets = providers.reduce((sum, p) => {
    return sum + parseInt(p.num_chunksets_stored.value);
  }, 0);

  const totalPhysicalStorage = totalChunksets * CHUNKSET_SIZE_BYTES;

  // Estimate logical data size
  // With n=16 shards, logical data should be totalPhysical / 16 * 10
  const totalLogicalData = (totalPhysicalStorage / 16) * 10;

  const actualOverhead = totalLogicalData > 0 ? totalPhysicalStorage / totalLogicalData : theoreticalOverhead;

  const efficiency = (theoreticalOverhead / actualOverhead) * 100;

  const wastedStorage = totalPhysicalStorage - (totalLogicalData * theoreticalOverhead);

  return {
    theoreticalOverhead,
    actualOverhead,
    efficiency,
    wastedStorage: wastedStorage / (1024 * 1024 * 1024), // Convert to GB
    totalLogicalData: totalLogicalData / (1024 * 1024 * 1024),
    totalPhysicalStorage: totalPhysicalStorage / (1024 * 1024 * 1024)
  };
}

/**
 * Calculate shard balance for erasure coding health
 */
export interface ShardBalance {
  activeShards: number;
  totalShards: number;
  requiredShards: number;
  balancePercentage: number;
  health: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

export function calculateShardBalance(activeShards: number): ShardBalance {
  const totalShards = 16;
  const requiredShards = 10;

  const balancePercentage = (activeShards / totalShards) * 100;

  let health: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  if (activeShards >= 14) health = 'EXCELLENT';
  else if (activeShards >= 12) health = 'GOOD';
  else if (activeShards >= requiredShards) health = 'FAIR';
  else health = 'POOR';

  return {
    activeShards,
    totalShards,
    requiredShards,
    balancePercentage,
    health
  };
}
