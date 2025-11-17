/**
 * Realistic mock data generator for Shelby Protocol
 * Simulates a working devnet with actual network activity
 */

import type { StorageProviderData } from './aptos';

// Simulate realistic storage providers across different data centers
export function generateMockStorageProviders(): StorageProviderData[] {
  const datacenters = [
    { name: 'dc_us_east', providers: 8, baseLoad: 0.65 },
    { name: 'dc_europe', providers: 6, baseLoad: 0.58 },
    { name: 'dc_asia', providers: 4, baseLoad: 0.72 },
    { name: 'dc_us_west', providers: 3, baseLoad: 0.45 },
  ];

  const providers: StorageProviderData[] = [];
  let addressSeed = 1000;

  for (const dc of datacenters) {
    for (let i = 0; i < dc.providers; i++) {
      const address = `0x${(addressSeed++).toString(16).padStart(64, '0')}`;

      // Realistic chunk storage: between 400k-900k per provider
      const baseChunks = 500000;
      const variance = Math.floor(Math.random() * 400000);
      const chunks = baseChunks + variance;

      // Simulate audit performance: 85-98% pass rate
      const totalAudits = Math.floor(Math.random() * 50) + 20;
      const passRate = 0.85 + Math.random() * 0.13;
      const passedAudits = Math.floor(totalAudits * passRate);

      const auditChallenges = Array(totalAudits).fill(null).map((_, idx) => ({
        challenge_id: idx,
        timestamp: Date.now() - Math.random() * 86400000
      }));

      const auditResponses = Array(totalAudits).fill(null).map((_, idx) =>
        idx < passedAudits
      );

      providers.push({
        address,
        failure_domain: {
          data_center: dc.name
        },
        num_chunksets_stored: {
          value: chunks.toString()
        },
        audit_challenge: auditChallenges,
        audit_response: auditResponses,
        placement_groups: [],
        bls_key: `bls_${address.slice(0, 16)}`
      });
    }
  }

  return providers;
}

// Simulate network growth over time
let networkStartSize = 185000;
let lastGrowthUpdate = Date.now();

export function getNetworkGrowth() {
  const now = Date.now();
  const timePassed = (now - lastGrowthUpdate) / 1000; // seconds

  // Grow by 3-8 blobs per minute
  const growthRate = 3 + Math.random() * 5;
  const newBlobs = Math.floor((timePassed / 60) * growthRate);

  networkStartSize += newBlobs;
  lastGrowthUpdate = now;

  return {
    totalBlobs: networkStartSize,
    growthRate: growthRate,
    recentBlobs: newBlobs
  };
}

// Simulate blob survival based on real erasure coding
export function calculateRealisticSurvival() {
  // In a healthy network, most blobs have 14-16 active shards
  const activeShards = 13 + Math.floor(Math.random() * 3); // 13-15

  return {
    activeShards,
    totalShards: 16,
    requiredShards: 10,
    description: activeShards >= 14
      ? "Healthy - Multiple redundant copies across network"
      : activeShards >= 12
      ? "Good - Sufficient redundancy for recovery"
      : "At risk - Close to minimum threshold"
  };
}

// Simulate read-to-earn economics
export function calculateRealisticEarnings() {
  // Typical hot storage: 30-60 reads per day
  const dailyReads = 30 + Math.floor(Math.random() * 30);

  // Shelby micropayment: ~$0.00012 per read
  const perReadEarning = 0.00012;
  const dailyEarnings = dailyReads * perReadEarning;

  return {
    dailyReads,
    dailyEarnings,
    weeklyEarnings: dailyEarnings * 7,
    monthlyEarnings: dailyEarnings * 30,
    storageCost: 0.015, // $0.015/GB/month
    netProfit: (dailyEarnings * 30) - 0.015
  };
}

// Simulate expiring blobs
export function generateExpiringBlobs() {
  const now = Date.now();

  return {
    next24h: {
      count: Math.floor(Math.random() * 5) + 2, // 2-6 blobs
      totalSize: (Math.random() * 15 + 5) * 1024 * 1024, // 5-20 MB
      urgency: 'critical'
    },
    nextWeek: {
      count: Math.floor(Math.random() * 20) + 15, // 15-35 blobs
      totalSize: (Math.random() * 100 + 50) * 1024 * 1024, // 50-150 MB
      urgency: 'warning'
    },
    nextMonth: {
      count: Math.floor(Math.random() * 60) + 80, // 80-140 blobs
      totalSize: (Math.random() * 500 + 200) * 1024 * 1024, // 200-700 MB
      urgency: 'info'
    }
  };
}

// Simulate payment tier comparison
export function generatePaymentTiers() {
  // Based on 1GB storage, varying read patterns
  const userReads = 45;

  return [
    {
      tier: 0,
      name: 'Basic',
      costPerGB: 0.012,
      readsPerDay: userReads,
      earnings: userReads * 0.00010,
      netROI: ((userReads * 0.00010 * 30) - (0.012 * 30)) / (0.012 * 30) * 100,
      description: 'Best for low-traffic data'
    },
    {
      tier: 1,
      name: 'Pro',
      costPerGB: 0.019,
      readsPerDay: userReads * 1.3,
      earnings: userReads * 1.3 * 0.00012,
      netROI: ((userReads * 1.3 * 0.00012 * 30) - (0.019 * 30)) / (0.019 * 30) * 100,
      description: 'Popular for active storage',
      recommended: true
    },
    {
      tier: 2,
      name: 'Enterprise',
      costPerGB: 0.028,
      readsPerDay: userReads * 1.8,
      earnings: userReads * 1.8 * 0.00015,
      netROI: ((userReads * 1.8 * 0.00015 * 30) - (0.028 * 30)) / (0.028 * 30) * 100,
      description: 'For high-throughput apps'
    }
  ];
}

// Simulate erasure coding efficiency
export function getErasureCodingStats() {
  // Clay: n=16, k=10 = theoretical 1.6x overhead
  // Real-world: slightly higher due to metadata
  const theoreticalOverhead = 1.6;
  const actualOverhead = 1.62 + Math.random() * 0.05; // 1.62-1.67x

  const totalLogicalData = 2.4; // TB
  const totalPhysicalStorage = totalLogicalData * actualOverhead;

  return {
    theoreticalOverhead,
    actualOverhead,
    efficiency: (theoreticalOverhead / actualOverhead) * 100,
    totalLogicalData,
    totalPhysicalStorage,
    wastedStorage: totalPhysicalStorage - (totalLogicalData * theoreticalOverhead),
    description: 'Clay encoding provides ~1.6x redundancy vs 2-3x for traditional Reed-Solomon'
  };
}
