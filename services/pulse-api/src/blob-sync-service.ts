import { logger } from './logger';
import { ShelbyAptosClient } from './aptos-client';
import {
  getLastBlobSyncedVersion,
  insertBlobEvents,
  getBlobSyncStats,
  type BlobEventRecord,
} from './db';

// Blob event type for Shelby Protocol
const BLOB_EVENT_TYPE = "0xc63d6a5efb0080a6029403131715bd4971e1149f7cc099aac69bb0069b3ddbf5::blob_metadata::BlobRegisteredEvent";

// Track sync state
let blobSyncInProgress = false;
let initialBlobSyncComplete = false;

/**
 * Check if initial blob sync has completed
 */
export function isInitialBlobSyncComplete(): boolean {
  return initialBlobSyncComplete;
}

/**
 * Perform incremental blob sync - fetch new blob events since last sync
 * This runs in small batches to avoid rate limits
 */
export async function incrementalBlobSync(aptosClient: ShelbyAptosClient): Promise<number> {
  if (blobSyncInProgress) {
    logger.debug('Blob sync already in progress, skipping');
    return 0;
  }

  blobSyncInProgress = true;
  const startTime = Date.now();

  try {
    const lastVersion = getLastBlobSyncedVersion();
    logger.info({ lastVersion }, 'Starting incremental blob sync');

    // Fetch new blob events since last version
    const newEvents = await fetchBlobEventsSinceVersion(aptosClient, lastVersion);

    if (newEvents.length === 0) {
      logger.debug('No new blob events to sync');
      initialBlobSyncComplete = true;
      return 0;
    }

    // Insert events into database
    const inserted = insertBlobEvents(newEvents);

    const duration = Date.now() - startTime;
    const stats = getBlobSyncStats();

    logger.info(
      {
        inserted,
        fetched: newEvents.length,
        duration,
        totalBlobs: stats.totalBlobs,
        totalStorage: stats.totalStorage,
      },
      'Incremental blob sync complete'
    );

    initialBlobSyncComplete = true;
    return inserted;
  } catch (error) {
    logger.error({
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Incremental blob sync failed');
    // Don't throw - we want the sync interval to continue
    return 0;
  } finally {
    blobSyncInProgress = false;
  }
}

/**
 * Fetch blob events since a specific version
 * Uses pagination to avoid rate limits
 */
async function fetchBlobEventsSinceVersion(
  aptosClient: ShelbyAptosClient,
  sinceVersion: number
): Promise<BlobEventRecord[]> {
  const events: BlobEventRecord[] = [];
  const pageSize = 100; // Aptos indexer limit
  let offset = 0;
  let hasMore = true;

  // Limit per sync cycle to avoid rate limits (fetch ~1000 events per cycle)
  // With 30s interval, this catches up ~2000/min = 120k/hour
  const maxEventsPerCycle = 1000;

  // Get GraphQL config from client (includes API key in headers)
  const graphqlConfig = aptosClient.getGraphQLConfig();

  while (hasMore && events.length < maxEventsPerCycle) {
    const query = `
      query GetNewBlobEvents($limit: Int!, $offset: Int!, $eventType: String!, $sinceVersion: bigint!) {
        events(
          where: {
            type: {_eq: $eventType},
            transaction_version: {_gt: $sinceVersion}
          }
          order_by: {transaction_version: asc}
          limit: $limit
          offset: $offset
        ) {
          transaction_version
          event_index
          data
        }
      }
    `;

    try {
      logger.debug({ url: graphqlConfig.url, offset, sinceVersion }, 'Fetching blob events page');

      const response = await fetch(graphqlConfig.url, {
        method: 'POST',
        headers: graphqlConfig.headers,
        body: JSON.stringify({
          query,
          variables: {
            limit: pageSize,
            offset,
            eventType: BLOB_EVENT_TYPE,
            sinceVersion: sinceVersion.toString(),
          },
        }),
      });

      if (!response.ok) {
        logger.error({ status: response.status, statusText: response.statusText }, 'GraphQL request failed');
        break;
      }

      const result = await response.json();

      if (result.errors) {
        // Check for rate limit
        const rateLimitError = result.errors.find(
          (e: { extensions?: { code?: string } }) => e.extensions?.code === "429"
        );
        if (rateLimitError) {
          logger.warn('Rate limited during blob sync, returning partial results');
          break;
        }
        logger.warn({ errors: result.errors }, 'GraphQL errors during blob sync');
        break;
      }

      const fetched = result.data?.events || [];

      if (fetched.length === 0) {
        hasMore = false;
        break;
      }

      // Log first event for debugging
      if (offset === 0 && fetched.length > 0) {
        logger.info({ firstEvent: fetched[0] }, 'Sample blob event from API');
      }

      for (const event of fetched) {
        const data = event.data || {};

        // Parse event data from BlobRegisteredEvent
        // Fields: blob_id, owner, blob_size, encoding, blob_name, creation_micros, expiration_micros
        // Note: better-sqlite3 requires null, not undefined, for nullable fields
        // Note: encoding can be an object { __variant__: "..." } - convert to string
        const encodingValue = data.encoding
          ? (typeof data.encoding === 'string' ? data.encoding : data.encoding.__variant__ || JSON.stringify(data.encoding))
          : null;

        const blobEvent: BlobEventRecord = {
          transaction_version: parseInt(event.transaction_version || '0', 10),
          event_index: typeof event.event_index === 'number' ? event.event_index : 0,
          blob_id: data.blob_id || data.blob_commitment || '',
          owner_address: data.owner || '',
          size_bytes: parseInt(data.blob_size || data.size_bytes || '0', 10),
          encoding: encodingValue,
          blob_name: data.blob_name ?? extractBlobName(data.blob_id) ?? null,
          creation_timestamp: data.creation_micros
            ? Math.floor(parseInt(data.creation_micros, 10) / 1000)
            : null,
          expiration_timestamp: data.expiration_micros
            ? Math.floor(parseInt(data.expiration_micros, 10) / 1000)
            : null,
        };

        // Log first parsed event for debugging
        if (events.length === 0) {
          logger.info({ parsedEvent: blobEvent }, 'First parsed blob event');
        }

        events.push(blobEvent);
      }

      offset += pageSize;

      if (fetched.length < pageSize) {
        hasMore = false;
      }
    } catch (error) {
      logger.error({ error, offset }, 'Failed to fetch blob events page');
      break;
    }
  }

  return events;
}

/**
 * Extract blob name from blob_id (format: "prefix/name.ext")
 */
function extractBlobName(blobId: string | null | undefined): string | null {
  if (!blobId) return null;
  const parts = blobId.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Get blob sync status for monitoring
 */
export function getBlobSyncStatus(): {
  syncInProgress: boolean;
  initialSyncComplete: boolean;
  stats: ReturnType<typeof getBlobSyncStats>;
} {
  return {
    syncInProgress: blobSyncInProgress,
    initialSyncComplete: initialBlobSyncComplete,
    stats: getBlobSyncStats(),
  };
}
