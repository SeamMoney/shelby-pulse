import NodeCache from "node-cache";
import type { ApiConfig } from "./config";
import { ShelbyAptosClient, type BlobEvent, type StorageProvider } from "./aptos-client";
import { logger } from "./logger";
import { getShelbyUSDLeaderboard, type LeaderboardEntry } from "./shelbyusd/leaderboard";
import { get24hVolume, type VolumeData } from "./shelbyusd/volume";
import { getMostActiveUsers, getBiggestSpenders, getRecentTransactions, type ActivityEntry, type SpenderEntry, type RecentTransaction } from "./shelbyusd/activity";
import { getAllTimeStats, type AllTimeStats } from "./shelbyusd/all-time-stats";

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

export interface EconomyData {
  leaderboard: LeaderboardEntry[];
  volume: VolumeData;
  allTimeStats: AllTimeStats;
  mostActive: ActivityEntry[];
  topSpenders: SpenderEntry[];
  recentTransactions: RecentTransaction[];
  timestamp: number;
}

export class DataService {
  private cache: NodeCache;
  private aptosClient: ShelbyAptosClient;
  private config: ApiConfig;
  private lastBlobCount = 0;
  private lastTimestamp = Date.now();

  constructor(config: ApiConfig) {
    this.config = config;
    this.cache = new NodeCache({
      stdTTL: config.CACHE_TTL_SECONDS,
      checkperiod: config.CACHE_TTL_SECONDS * 2,
    });
    this.aptosClient = new ShelbyAptosClient(config);
  }

  /**
   * Get network statistics with caching
   */
  async getNetworkStats(): Promise<NetworkStats> {
    const cacheKey = "network_stats";
    const cached = this.cache.get<NetworkStats>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [totalBlobs, totalStorage] = await Promise.all([
        this.aptosClient.getTotalBlobCount(),
        this.aptosClient.getTotalStorage(),
      ]);

      // Calculate upload rate (blobs per minute)
      const now = Date.now();
      const timeDiff = (now - this.lastTimestamp) / 1000 / 60; // minutes
      const blobDiff = totalBlobs - this.lastBlobCount;
      const uploadRate =
        timeDiff > 0 && blobDiff > 0 ? blobDiff / timeDiff : 0;

      this.lastBlobCount = totalBlobs;
      this.lastTimestamp = now;

      const stats: NetworkStats = {
        totalBlobs,
        totalStorage,
        totalStorageFormatted: this.formatBytes(totalStorage),
        uploadRate,
        timestamp: now,
      };

      this.cache.set(cacheKey, stats);
      return stats;
    } catch (error) {
      logger.error({ error }, "Failed to fetch network stats");
      throw error;
    }
  }

  /**
   * Get recent blob events
   */
  async getRecentBlobs(limit = 20): Promise<BlobData[]> {
    const cacheKey = `recent_blobs_${limit}`;
    const cached = this.cache.get<BlobData[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const events = await this.aptosClient.fetchBlobEvents(limit);

      const blobs: BlobData[] = events.map((event) => {
        // Parse Shelby event data structure
        const sizeBytes = Number.parseInt(event.data?.size_bytes || "0", 10);
        const expirationMicros = Number.parseInt(
          event.data?.expiration_micros || "0",
          10,
        );
        const expirationDate = new Date(expirationMicros / 1000);

        return {
          id: event.data?.blob_commitment || event.sequence_number,
          owner: this.shortenAddress(event.data?.owner || "unknown"),
          name: event.data?.blob_id?.split('/').pop() || this.generateBlobName(event.sequence_number),
          encoding: typeof event.data?.encoding === 'string' ? event.data.encoding : 'unknown',
          expires: expirationDate.toLocaleDateString("en-US"),
          size: this.formatBytes(sizeBytes),
          sizeBytes,
          version: event.version,
        };
      });

      this.cache.set(cacheKey, blobs);
      return blobs;
    } catch (error) {
      logger.error({ error }, "Failed to fetch recent blobs");
      throw error;
    }
  }

  /**
   * Get storage providers
   */
  async getStorageProviders(): Promise<StorageProvider[]> {
    const cacheKey = "storage_providers";
    const cached = this.cache.get<StorageProvider[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const providers = await this.aptosClient.fetchStorageProviders();
      this.cache.set(cacheKey, providers);
      return providers;
    } catch (error) {
      logger.error({ error }, "Failed to fetch storage providers");
      throw error;
    }
  }

  /**
   * Get all blob events (for activity feed)
   */
  async getAllBlobEvents(limit = 100): Promise<BlobEvent[]> {
    const cacheKey = `all_events_${limit}`;
    const cached = this.cache.get<BlobEvent[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const events = await this.aptosClient.fetchBlobEvents(limit);
      this.cache.set(cacheKey, events);
      return events;
    } catch (error) {
      logger.error({ error }, "Failed to fetch blob events");
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; timestamp: number }> {
    try {
      // Try to fetch a simple resource to verify connection
      await this.aptosClient.getTotalBlobCount();
      return {
        status: "healthy",
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error({ error }, "Health check failed");
      return {
        status: "unhealthy",
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get ShelbyUSD economy data with caching
   * Includes all-time stats since ShelbyNet (devnet) inception
   */
  async getEconomyData(): Promise<EconomyData> {
    const cacheKey = "economy_data";
    const cached = this.cache.get<EconomyData>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [leaderboard, volume, allTimeStats, mostActive, topSpenders, recentTransactions] = await Promise.all([
        getShelbyUSDLeaderboard(this.aptosClient, 20),
        get24hVolume(this.aptosClient),
        getAllTimeStats(this.aptosClient),
        getMostActiveUsers(this.aptosClient, 10),
        getBiggestSpenders(this.aptosClient, 10),
        getRecentTransactions(this.aptosClient, 20),
      ]);

      const economyData: EconomyData = {
        leaderboard,
        volume,
        allTimeStats,
        mostActive,
        topSpenders,
        recentTransactions,
        timestamp: Date.now(),
      };

      this.cache.set(cacheKey, economyData);
      return economyData;
    } catch (error) {
      logger.error({ error }, "Failed to fetch economy data");
      throw error;
    }
  }

  /**
   * Clear cache (useful for debugging)
   */
  clearCache(): void {
    this.cache.flushAll();
    logger.info("Cache cleared");
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  private shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-5)}`;
  }

  private generateBlobName(id: string): string {
    // Generate a more friendly name based on blob ID
    const fileNames = [
      "contract_data.json",
      "nft_metadata.json",
      "user_avatar.png",
      "game_state.dat",
      "backup.zip",
      "config.yaml",
      "image.jpg",
      "transaction_log.txt",
      "storage_proof.bin",
      "blockchain_snapshot.db",
    ];

    // Use the ID to deterministically pick a name
    const hash = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return fileNames[hash % fileNames.length];
  }
}
