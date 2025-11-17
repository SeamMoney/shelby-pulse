import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

// Initialize Aptos client for devnet
const config = new AptosConfig({ network: Network.DEVNET });
export const aptos = new Aptos(config);

// Shelby Protocol addresses on Aptos devnet
export const SHELBY_ADDRESSES = {
  GLOBAL_METADATA: '0x1', // Replace with actual address
  STORAGE_PROVIDERS: [
    // Add actual storage provider addresses here
  ] as string[]
};

// Type definitions for Shelby Protocol data structures
export interface StorageProviderData {
  address: string;
  failure_domain: {
    data_center: string;
  };
  num_chunksets_stored: {
    value: string;
  };
  audit_challenge: Array<{
    challenge_id: number;
    timestamp: number;
  }>;
  audit_response: boolean[];
  placement_groups: unknown[];
  bls_key: string;
}

export interface BlobRegisteredEvent {
  blob_commitment: string;
  owner: string;
  expiration_micros: string;
  size_bytes: number;
}
