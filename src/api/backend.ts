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
   * Fetch storage providers
   */
  async getProviders(): Promise<StorageProvider[]> {
    const response = await fetch(`${this.baseUrl}/providers`);
    if (!response.ok) {
      throw new Error(`Failed to fetch providers: ${response.statusText}`);
    }
    return response.json();
  }
}

export const backendApi = new BackendApiClient();
