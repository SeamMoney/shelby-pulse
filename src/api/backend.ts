/**
 * Backend API client for Shelby Pulse
 * Fetches real data from the pulse-api service
 */

// Use Vercel serverless function catch-all proxy
const API_BASE_URL = '/api';

export interface NetworkStats {
  totalBlobs: number;
  totalStorage: number;
  totalStorageFormatted: string;
  uploadRate: number;
  timestamp: number;
}

export interface BlobData {
  id: string;
  owner: string;
  name: string;
  encoding: string;
  expires: string;
  size: string;
  sizeBytes: number;
  version: string;
}

export interface BlobEvent {
  type: string;
  data: {
    blob_commitment?: string;
    owner?: string;
    expiration_micros?: string;
    size_bytes?: string;
    encoding?: string;
    blob_id?: string;
  };
  version: string;
  sequence_number: string;
}

export interface LeaderboardEntry {
  address: string;
  balance: number;
  barWidth: number;
}

export interface VolumeData {
  volume24h: number;
  transferCount24h: number;
  velocity: number;
}

export interface EarnerEntry {
  address: string;
  totalEarned: number;
  barWidth: number;
}

export interface SpenderEntry {
  address: string;
  totalSpent: number;
  barWidth: number;
}

export interface EconomyData {
  leaderboard: LeaderboardEntry[];
  volume: VolumeData;
  topEarners: EarnerEntry[];
  topSpenders: SpenderEntry[];
  timestamp: number;
}

export interface StorageProvider {
  address: string;
  datacenter: string;
  chunks_stored: number;
  usage?: number;
}

export interface NodeInfo {
  id: number;
  name: string;
  status: string;
  ip?: string;
  createdAt: string;
  farmingStatus: 'pending' | 'running' | 'completed' | 'failed';
  farmedAmount: number;
  successfulRequests: number;
  failedRequests: number;
}

export interface FarmingSession {
  id: string;
  walletAddress: string;
  startedAt: string;
  droplets: NodeInfo[];
  totalFarmed: number;
  status: 'starting' | 'running' | 'completed' | 'stopped' | 'failed';
}

export interface FarmingOverview {
  totalSessions: number;
  activeSessions: number;
  totalDroplets: number;
  estimatedTotalFarmed: number;
}

export interface UserDeposit {
  txHash: string;
  amount: number;
  version: string;
}

class BackendApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch network statistics
   */
  async getNetworkStats(): Promise<NetworkStats> {
    const response = await fetch(`${this.baseUrl}/network/stats`);
    if (!response.ok) {
      throw new Error(`Failed to fetch network stats: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch recent blobs
   */
  async getRecentBlobs(limit = 20): Promise<BlobData[]> {
    const response = await fetch(`${this.baseUrl}/blobs/recent?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recent blobs: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch recent events
   */
  async getRecentEvents(limit = 100): Promise<BlobEvent[]> {
    const response = await fetch(`${this.baseUrl}/events/recent?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch economy data
   */
  async getEconomy(): Promise<EconomyData> {
    const response = await fetch(`${this.baseUrl}/economy`);
    if (!response.ok) {
      throw new Error(`Failed to fetch economy data: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Health check
   */
  async health(): Promise<{ status: string; timestamp: number }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get user's recent ShelbyUSD deposits with transaction hashes
   */
  async getUserDeposits(address: string, sinceVersion?: string, limit = 10): Promise<UserDeposit[]> {
    const params = new URLSearchParams({ address, limit: limit.toString() });
    if (sinceVersion) {
      params.append('since_version', sinceVersion);
    }
    const response = await fetch(`${this.baseUrl}/user/deposits?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch user deposits: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Fetch storage providers
   */
  async getProviders(): Promise<StorageProvider[]> {
    const response = await fetch(`${this.baseUrl}/providers`);
    if (!response.ok) {
      throw new Error(`Failed to fetch providers: ${response.statusText}`);
    }
    return response.json();
  }

  // ============================================
  // FARMING API
  // ============================================

  /**
   * Start a farming session
   */
  async startFarming(walletAddress: string, numDroplets: number = 5): Promise<FarmingSession> {
    const response = await fetch(`${this.baseUrl}/farming/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, numDroplets }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to start farming: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get farming status
   */
  async getFarmingStatus(sessionId?: string): Promise<FarmingSession | FarmingSession[]> {
    const url = sessionId
      ? `${this.baseUrl}/farming/status?sessionId=${sessionId}`
      : `${this.baseUrl}/farming/status`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to get farming status: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get farming overview
   */
  async getFarmingOverview(): Promise<FarmingOverview> {
    const response = await fetch(`${this.baseUrl}/farming/overview`);
    if (!response.ok) {
      throw new Error(`Failed to get farming overview: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Stop a farming session
   */
  async stopFarming(sessionId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/farming/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to stop farming: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Cleanup all farming nodes
   */
  async cleanupFarming(): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/farming/cleanup`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to cleanup farming: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Clear old/failed sessions from memory
   */
  async clearSessions(): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/farming/clear-sessions`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to clear sessions: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Request faucet directly
   */
  async requestFaucet(walletAddress: string): Promise<{ txn_hashes: string[] }> {
    const response = await fetch(`${this.baseUrl}/farming/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to request faucet: ${response.statusText}`);
    }
    return response.json();
  }
}

export const backendApi = new BackendApiClient();
