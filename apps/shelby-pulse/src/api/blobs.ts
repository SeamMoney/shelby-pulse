import { BlobRegisteredEvent } from './aptos';

export interface BlobSurvivalProbability {
  blobCommitment: string;
  activeShards: number;
  totalShards: number;
  requiredShards: number; // k value
  survivalProbabilities: {
    failures: number;
    probability: number;
  }[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Fetch recent blob registration events
 */
export async function fetchRecentBlobs(_limit = 50): Promise<BlobRegisteredEvent[]> {
  try {
    // For now, return mock data until we can test the actual API
    // In production, use: await aptos.getEvents({...})
    return [];
  } catch (error) {
    console.error('Failed to fetch recent blobs:', error);
    return [];
  }
}

/**
 * Calculate survival probability for a blob based on erasure coding
 * Using Clay encoding: n=16 total shards, k=10 required for recovery
 */
export function calculateSurvivalProbability(
  activeShards: number,
  totalShards: number = 16,
  requiredShards: number = 10,
  providerFailureRate: number = 0.05 // 5% assumed failure rate
): BlobSurvivalProbability {
  // Calculate binomial probability of surviving X failures
  const survivalProbabilities = [];

  for (let failures = 1; failures <= 5; failures++) {
    // Can we still recover after X failures?
    const remainingShards = activeShards - failures;

    if (remainingShards >= requiredShards) {
      // Calculate probability using binomial distribution
      // P(exactly k failures) = C(n,k) * p^k * (1-p)^(n-k)
      const probability = calculateBinomialProbability(
        activeShards,
        failures,
        providerFailureRate
      );

      survivalProbabilities.push({
        failures,
        probability: probability * 100 // Convert to percentage
      });
    } else {
      survivalProbabilities.push({
        failures,
        probability: 0
      });
    }
  }

  // Determine risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  const margin = activeShards - requiredShards;

  if (margin >= 4) riskLevel = 'LOW';
  else if (margin >= 2) riskLevel = 'MEDIUM';
  else if (margin >= 1) riskLevel = 'HIGH';
  else riskLevel = 'CRITICAL';

  return {
    blobCommitment: 'placeholder',
    activeShards,
    totalShards,
    requiredShards,
    survivalProbabilities,
    riskLevel
  };
}

function calculateBinomialProbability(n: number, k: number, p: number): number {
  // C(n, k) = n! / (k! * (n-k)!)
  const binomialCoefficient = factorial(n) / (factorial(k) * factorial(n - k));
  // P = C(n,k) * p^k * (1-p)^(n-k)
  return binomialCoefficient * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

/**
 * Track blobs by expiration to show timeline
 */
export interface ExpirationRisk {
  timeWindow: string;
  blobCount: number;
  totalSize: number;
  urgentBlobs: {
    commitment: string;
    expiresIn: number; // milliseconds
    owner: string;
  }[];
}

export function analyzeExpirationRisk(blobs: BlobRegisteredEvent[]): ExpirationRisk[] {
  const now = Date.now() * 1000; // Convert to microseconds

  const windows = [
    { label: 'Next 24h', max: 24 * 60 * 60 * 1000 * 1000 },
    { label: 'Next Week', max: 7 * 24 * 60 * 60 * 1000 * 1000 },
    { label: 'Next Month', max: 30 * 24 * 60 * 60 * 1000 * 1000 },
  ];

  return windows.map(window => {
    const expiringBlobs = blobs.filter(blob => {
      const expirationMicros = parseInt(blob.expiration_micros);
      const timeUntilExpiration = expirationMicros - now;
      return timeUntilExpiration > 0 && timeUntilExpiration <= window.max;
    });

    const urgentBlobs = expiringBlobs
      .slice(0, 5)
      .map(blob => ({
        commitment: blob.blob_commitment,
        expiresIn: parseInt(blob.expiration_micros) - now,
        owner: blob.owner
      }));

    return {
      timeWindow: window.label,
      blobCount: expiringBlobs.length,
      totalSize: expiringBlobs.length * 1000000, // Rough estimate
      urgentBlobs
    };
  });
}

/**
 * Calculate network growth metrics
 */
export interface GrowthMetrics {
  totalBlobs: number;
  growthRate: number; // blobs per day
  acceleration: number; // change in growth rate
  trend: 'ACCELERATING' | 'STEADY' | 'DECELERATING';
}

let previousBlobCount = 0;
let previousGrowthRate = 0;
let previousTimestamp = Date.now();

export function calculateNetworkGrowth(currentBlobCount: number): GrowthMetrics {
  const now = Date.now();
  const timeDiffDays = (now - previousTimestamp) / (1000 * 60 * 60 * 24);

  let growthRate = 0;
  let acceleration = 0;
  let trend: 'ACCELERATING' | 'STEADY' | 'DECELERATING' = 'STEADY';

  if (timeDiffDays > 0 && previousBlobCount > 0) {
    const blobDiff = currentBlobCount - previousBlobCount;
    growthRate = blobDiff / timeDiffDays;
    acceleration = growthRate - previousGrowthRate;

    if (acceleration > 10) trend = 'ACCELERATING';
    else if (acceleration < -10) trend = 'DECELERATING';
  }

  previousBlobCount = currentBlobCount;
  previousGrowthRate = growthRate;
  previousTimestamp = now;

  return {
    totalBlobs: currentBlobCount,
    growthRate,
    acceleration,
    trend
  };
}
