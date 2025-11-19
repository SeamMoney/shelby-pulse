import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import type { ApiConfig } from "./config";
import { logger } from "./logger";

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
  guid: {
    creation_number: string;
    account_address: string;
  };
  sequence_number: string;
  type_: string;
}

export interface StorageProvider {
  address: string;
  datacenter: string;
  chunks_stored: number;
  total_audits: number;
  passed_audits: number;
  audit_pass_rate: number;
}

export interface ShelbyUSDEvent {
  type: 'withdraw' | 'deposit';
  account: string;
  amount: number;
  timestamp: number;
  version: string;
}

// ShelbyUSD fungible asset metadata address
export const SHELBYUSD_METADATA = "0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1";

export class ShelbyAptosClient {
  private aptos: Aptos;
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;

    const aptosConfig = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: config.APTOS_NODE_URL,
      indexer: config.APTOS_INDEXER_URL,
    });

    this.aptos = new Aptos(aptosConfig);
    logger.info(
      {
        network: config.APTOS_NETWORK,
        nodeUrl: config.APTOS_NODE_URL,
        indexerUrl: config.APTOS_INDEXER_URL,
      },
      "Initialized Aptos client for Shelby network",
    );
  }

  /**
   * Fetch recent blob registration events using GraphQL
   */
  async fetchBlobEvents(limit = 50): Promise<BlobEvent[]> {
    try {
      // Query events using GraphQL - this is more reliable than querying specific module events
      const query = `
        query GetBlobEvents($limit: Int!) {
          events(
            limit: $limit
            order_by: {transaction_version: desc}
            where: {type: {_like: "%BlobRegisteredEvent"}}
          ) {
            type
            data
            transaction_version
            sequence_number
            indexed_type
          }
        }
      `;

      const response = await fetch(this.config.APTOS_INDEXER_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { limit },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        logger.warn({ errors: result.errors }, "GraphQL query returned errors");
        return [];
      }

      const events = result.data?.events || [];
      return events.map((event: any) => ({
        type: event.type,
        data: event.data,
        version: event.transaction_version,
        sequence_number: event.sequence_number,
        type_: event.indexed_type,
        guid: {
          creation_number: "0",
          account_address: "0x0",
        },
      }));
    } catch (error) {
      logger.error({ error }, "Failed to fetch blob events");
      return [];
    }
  }

  /**
   * Get total blob count from events
   */
  async getTotalBlobCount(): Promise<number> {
    try {
      // Query a large number of events to get total count
      // Note: This is a workaround since events_aggregate is not available
      const query = `
        query GetTotalBlobs {
          events(
            where: {type: {_like: "%BlobRegisteredEvent"}}
            limit: 100000
          ) {
            type
          }
        }
      `;

      const response = await fetch(this.config.APTOS_INDEXER_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();
      const events = result.data?.events || [];
      return events.length;
    } catch (error) {
      logger.warn({ error }, "Failed to fetch total blob count");
      return 0;
    }
  }

  /**
   * Get total storage size from events
   */
  async getTotalStorage(): Promise<number> {
    try {
      // Sum storage from all blob events
      const query = `
        query GetTotalStorage {
          events(
            where: {type: {_like: "%BlobRegisteredEvent"}}
            limit: 100000
          ) {
            data
          }
        }
      `;

      const response = await fetch(this.config.APTOS_INDEXER_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();
      const events = result.data?.events || [];

      let totalBytes = 0;
      for (const event of events) {
        // The actual field is blob_size, not size_bytes
        const sizeBytes = Number.parseInt(event.data?.blob_size || "0", 10);
        totalBytes += sizeBytes;
      }

      return totalBytes;
    } catch (error) {
      logger.warn({ error }, "Failed to fetch total storage");
      return 0;
    }
  }

  /**
   * Fetch storage providers
   */
  async fetchStorageProviders(): Promise<StorageProvider[]> {
    try {
      // This would need to query the actual storage provider registry
      // For now, return empty array - need to know the actual module structure
      const resource = await this.aptos.getAccountResource({
        accountAddress: this.config.SHELBY_MODULE_ADDRESS,
        resourceType: `${this.config.SHELBY_MODULE_ADDRESS}::storage_provider::ProviderRegistry`,
      });

      // Parse the provider data from the resource
      // This structure depends on the actual on-chain data format
      logger.debug({ resource }, "Raw provider registry data");

      return [];
    } catch (error) {
      logger.warn({ error }, "Failed to fetch storage providers");
      return [];
    }
  }

  /**
   * Fetch ShelbyUSD withdraw and deposit events
   */
  async getShelbyUSDEvents(limit = 1000): Promise<ShelbyUSDEvent[]> {
    try {
      // Query both WithdrawEvent and DepositEvent for ShelbyUSD
      const query = `
        query GetShelbyUSDEvents($limit: Int!) {
          events(
            limit: $limit
            order_by: {transaction_version: desc}
            where: {
              _or: [
                {type: {_like: "%0x1::fungible_asset::WithdrawEvent"}},
                {type: {_like: "%0x1::fungible_asset::DepositEvent"}}
              ]
            }
          ) {
            type
            data
            transaction_version
            account_address
          }
        }
      `;

      const response = await fetch(this.config.APTOS_INDEXER_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { limit },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        logger.warn({ errors: result.errors }, "GraphQL query returned errors");
        return [];
      }

      const events = result.data?.events || [];

      // Filter for ShelbyUSD only and transform
      const shelbyUSDEvents: ShelbyUSDEvent[] = [];
      for (const event of events) {
        // Check if this event is for ShelbyUSD by checking the metadata field
        const metadata = event.data?.metadata;
        if (metadata && metadata.toLowerCase() === SHELBYUSD_METADATA.toLowerCase()) {
          const isWithdraw = event.type.includes('WithdrawEvent');
          shelbyUSDEvents.push({
            type: isWithdraw ? 'withdraw' : 'deposit',
            account: event.account_address,
            amount: Number.parseInt(event.data?.amount || "0", 10),
            timestamp: Date.now(), // Use transaction_version to derive timestamp if available
            version: event.transaction_version,
          });
        }
      }

      return shelbyUSDEvents;
    } catch (error) {
      logger.error({ error }, "Failed to fetch ShelbyUSD events");
      return [];
    }
  }

  /**
   * Get the Aptos client instance for advanced queries
   */
  getClient(): Aptos {
    return this.aptos;
  }
}
