import { aptos, SHELBY_ADDRESSES, StorageProviderData } from './aptos';

export interface FailureDomainStats {
  domain: string;
  chunksets: number;
  providers: number;
  percentage: number;
}

export interface DecentralizationMetrics {
  giniCoefficient: number;
  score: number; // 0-1, higher is better
  domainStats: FailureDomainStats[];
  totalChunksets: number;
  totalProviders: number;
}

/**
 * Fetch all storage provider data from the chain
 */
export async function fetchAllStorageProviders(): Promise<StorageProviderData[]> {
  try {
    const providers: StorageProviderData[] = [];

    // Fetch data for known storage providers
    for (const address of SHELBY_ADDRESSES.STORAGE_PROVIDERS) {
      try {
        const resource = await aptos.getAccountResource({
          accountAddress: address,
          resourceType: `${SHELBY_ADDRESSES.GLOBAL_METADATA}::storage_provider::StorageProvider`
        });

        providers.push({
          address,
          ...resource
        } as StorageProviderData);
      } catch (error) {
        console.warn(`Failed to fetch provider ${address}:`, error);
      }
    }

    return providers;
  } catch (error) {
    console.error('Failed to fetch storage providers:', error);
    return [];
  }
}

/**
 * Calculate decentralization health score based on chunk distribution
 */
export function calculateDecentralizationScore(providers: StorageProviderData[]): DecentralizationMetrics {
  // Group by failure domain
  const domainMap = new Map<string, { chunksets: number; providers: number }>();
  let totalChunksets = 0;

  for (const provider of providers) {
    const domain = provider.failure_domain.data_center;
    const chunksets = parseInt(provider.num_chunksets_stored.value);

    totalChunksets += chunksets;

    const current = domainMap.get(domain) || { chunksets: 0, providers: 0 };
    domainMap.set(domain, {
      chunksets: current.chunksets + chunksets,
      providers: current.providers + 1
    });
  }

  // Calculate Gini coefficient for distribution inequality
  const domainChunksets = Array.from(domainMap.values()).map(d => d.chunksets).sort((a, b) => a - b);
  const n = domainChunksets.length;

  let gini = 0;
  if (n > 0 && totalChunksets > 0) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (2 * (i + 1) - n - 1) * domainChunksets[i];
    }
    gini = sum / (n * totalChunksets);
  }

  // Convert to 0-1 score (0 = all in one domain, 1 = perfectly distributed)
  const score = 1 - Math.abs(gini);

  // Create domain stats
  const domainStats: FailureDomainStats[] = Array.from(domainMap.entries()).map(([domain, stats]) => ({
    domain,
    chunksets: stats.chunksets,
    providers: stats.providers,
    percentage: totalChunksets > 0 ? (stats.chunksets / totalChunksets) * 100 : 0
  })).sort((a, b) => b.chunksets - a.chunksets);

  return {
    giniCoefficient: gini,
    score,
    domainStats,
    totalChunksets,
    totalProviders: providers.length
  };
}

/**
 * Calculate storage provider reliability index
 */
export interface ProviderReliability {
  address: string;
  domain: string;
  score: number; // 0-100
  auditPassRate: number;
  chunksetsStored: number;
  rank: number;
}

export function calculateProviderReliability(providers: StorageProviderData[]): ProviderReliability[] {
  const reliabilities = providers.map(provider => {
    const totalChallenges = provider.audit_challenge.length;
    const passedAudits = provider.audit_response.filter(Boolean).length;
    const auditPassRate = totalChallenges > 0 ? (passedAudits / totalChallenges) * 100 : 100;

    const chunksetsStored = parseInt(provider.num_chunksets_stored.value);

    // Score: 50% audit pass rate + 30% uptime (assumed 100% if storing chunks) + 20% volume (more chunks = more tested)
    const uptimeScore = chunksetsStored > 0 ? 100 : 0;
    const volumeScore = Math.min(100, (chunksetsStored / 1000000) * 100); // Max at 1M chunks

    const score = (auditPassRate * 0.5) + (uptimeScore * 0.3) + (volumeScore * 0.2);

    return {
      address: provider.address,
      domain: provider.failure_domain.data_center,
      score,
      auditPassRate,
      chunksetsStored,
      rank: 0 // Will be set after sorting
    };
  });

  // Sort by score and assign ranks
  reliabilities.sort((a, b) => b.score - a.score);
  reliabilities.forEach((r, i) => r.rank = i + 1);

  return reliabilities;
}
