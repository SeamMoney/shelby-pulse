/**
 * Backend API client for Shelby Pulse
 * Fetches real data from the pulse-api service
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
   * Health check
   */
  async health(): Promise<{ status: string; timestamp: number }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }
}

export const backendApi = new BackendApiClient();
