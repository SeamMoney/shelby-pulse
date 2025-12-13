import type { ApiConfig } from './config';
import { logger } from './logger';
import {
  getAllActiveFarmingJobs,
  getFarmingJob,
  updateFarmingJobAfterWave,
  createFarmingWave,
  completeFarmingWave,
  stopFarmingJob,
  type FarmingJob,
} from './db';

// DigitalOcean regions for geographic diversity (different IP pools)
const DO_REGIONS = [
  'sfo3',  // San Francisco
  'nyc3',  // New York
  'ams3',  // Amsterdam
  'sgp1',  // Singapore
  'lon1',  // London
  'fra1',  // Frankfurt
  'tor1',  // Toronto
  'blr1',  // Bangalore
];

// Faucet config (same as farming-service.ts)
const FAUCET_URL = 'https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd';
const DEFAULT_AMOUNT = 1000000000; // 10 ShelbyUSD (8 decimals)
const REQUESTS_PER_NODE = 50; // Max 50 requests per IP per day

interface DropletResult {
  region: string;
  dropletId: number | null;
  success: boolean;
  error?: string;
}

export class FarmingScheduler {
  private config: ApiConfig;
  private cloudApiUrl = 'https://api.digitalocean.com/v2';
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  // Check for new waves every 15 seconds (more responsive)
  private readonly CHECK_INTERVAL_MS = 15 * 1000;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  /**
   * Start the scheduler - runs in background, checks for active jobs
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Farming scheduler already running');
      return;
    }

    logger.info('Starting farming scheduler');
    this.intervalId = setInterval(() => this.tick(), this.CHECK_INTERVAL_MS);

    // Also run immediately
    this.tick();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Farming scheduler stopped');
    }
  }

  /**
   * Main scheduler tick - check and process active jobs
   */
  private async tick(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('Scheduler tick skipped - already processing');
      return;
    }

    this.isProcessing = true;

    try {
      const activeJobs = getAllActiveFarmingJobs();

      if (activeJobs.length === 0) {
        logger.debug('No active farming jobs');
        return;
      }

      logger.debug({ jobCount: activeJobs.length }, 'Processing active farming jobs');

      for (const job of activeJobs) {
        await this.processJob(job);
      }
    } catch (error) {
      logger.error({ error }, 'Scheduler tick failed');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single farming job - deploy wave if needed
   */
  private async processJob(job: FarmingJob): Promise<void> {
    const now = Date.now();
    const { config } = job;

    // Check if we've hit max waves
    if (config.maxWaves && job.waves_completed >= config.maxWaves) {
      logger.info({ jobId: job.id, waves: job.waves_completed }, 'Job reached max waves, completing');
      stopFarmingJob(job.id, 'completed');
      return;
    }

    // Check if enough time has passed since last wave
    const timeSinceLastWave = job.last_wave_at ? now - job.last_wave_at : Infinity;
    if (timeSinceLastWave < config.waveIntervalMs) {
      const remainingMs = config.waveIntervalMs - timeSinceLastWave;
      logger.debug(
        { jobId: job.id, remainingSeconds: Math.ceil(remainingMs / 1000) },
        'Waiting for next wave interval'
      );
      return;
    }

    // Time for a new wave!
    await this.deployWave(job);
  }

  /**
   * Deploy a wave of droplets across regions
   */
  private async deployWave(job: FarmingJob): Promise<void> {
    const { config } = job;
    const waveNumber = job.waves_completed + 1;

    logger.info(
      { jobId: job.id, waveNumber, regions: config.regions, dropletsPerRegion: config.dropletsPerRegion },
      'Deploying farming wave'
    );

    // Create wave record
    const wave = createFarmingWave(
      job.id,
      waveNumber,
      config.regions,
      config.dropletsPerRegion
    );

    // Deploy droplets in parallel across all regions
    const deploymentPromises: Promise<DropletResult>[] = [];

    for (const region of config.regions) {
      for (let i = 0; i < config.dropletsPerRegion; i++) {
        deploymentPromises.push(
          this.createDroplet(job.wallet_address, region, job.id, waveNumber, i + 1)
        );
      }
    }

    const results = await Promise.all(deploymentPromises);

    // Count successes and failures
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    // Estimate minted tokens (50 requests × 10 ShelbyUSD per successful droplet)
    const estimatedMinted = succeeded * REQUESTS_PER_NODE * (DEFAULT_AMOUNT / 1e8) * 1e8;

    // Update wave record
    completeFarmingWave(wave.id, succeeded, failed, estimatedMinted);

    // Update job stats
    updateFarmingJobAfterWave(job.id, succeeded, failed, estimatedMinted);

    logger.info(
      {
        jobId: job.id,
        waveNumber,
        succeeded,
        failed,
        estimatedMinted: estimatedMinted / 1e8,
      },
      'Wave deployment complete'
    );
  }

  /**
   * Create a single farming droplet in a specific region
   */
  private async createDroplet(
    walletAddress: string,
    region: string,
    jobId: string,
    waveNumber: number,
    index: number
  ): Promise<DropletResult> {
    if (!this.config.DO_API_TOKEN) {
      return { region, dropletId: null, success: false, error: 'No DO API token' };
    }

    const name = `cfarm-${jobId.split('-')[1]}-w${waveNumber}-${region}-${index}`;
    const farmingScript = this.generateFarmingScript(walletAddress, this.config.DO_API_TOKEN);

    try {
      const response = await fetch(`${this.cloudApiUrl}/droplets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.DO_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          region,
          size: 's-1vcpu-512mb-10gb',
          image: 'ubuntu-24-04-x64',
          user_data: farmingScript,
          tags: ['shelby-farmer', 'continuous', jobId],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DO API error (${response.status}): ${errorText}`);
      }

      const data = await response.json() as { droplet: { id: number } };
      return { region, dropletId: data.droplet.id, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, region, name }, 'Failed to create droplet');
      return { region, dropletId: null, success: false, error: errorMessage };
    }
  }

  /**
   * Generate the farming script that runs on each droplet
   * Droplets self-destruct after completing
   */
  private generateFarmingScript(walletAddress: string, doApiToken: string): string {
    return `#!/bin/bash
# Continuous Farming Bot - Self-destructing after completion
WALLET="${walletAddress}"
FAUCET_URL="${FAUCET_URL}"
AMOUNT=${DEFAULT_AMOUNT}
REQUESTS=${REQUESTS_PER_NODE}
DELAY=2
DO_TOKEN="${doApiToken}"

# Get this droplet's ID from metadata
DROPLET_ID=$(curl -s http://169.254.169.254/metadata/v1/id)

echo "Starting ShelbyUSD farming to $WALLET"
echo "Droplet ID: $DROPLET_ID"
echo "Making $REQUESTS requests..."

success=0
failed=0

for i in $(seq 1 $REQUESTS); do
    result=$(curl -s -X POST "$FAUCET_URL" \\
        -H "Content-Type: application/json" \\
        -H "Origin: https://docs.shelby.xyz" \\
        -d "{\\"address\\":\\"$WALLET\\",\\"amount\\":$AMOUNT}")

    if echo "$result" | grep -q "txn_hashes"; then
        if echo "$result" | grep -q '"txn_hashes":\\[\\]'; then
            echo "[$i/$REQUESTS] Failed: $(echo $result | jq -r .rejection_reasons[0].reason 2>/dev/null || echo $result)"
            ((failed++))
        else
            txn=$(echo $result | jq -r .txn_hashes[0] 2>/dev/null)
            echo "[$i/$REQUESTS] Success: \${txn:0:16}..."
            ((success++))
        fi
    else
        echo "[$i/$REQUESTS] Error: $result"
        ((failed++))
    fi

    sleep $DELAY
done

echo ""
echo "=== Farming Complete ==="
echo "Success: $success"
echo "Failed: $failed"
echo "Total SHELBY_USD: $((success * 10))"

# Self-destruct: delete this droplet
echo "Self-destructing droplet $DROPLET_ID..."
curl -s -X DELETE "https://api.digitalocean.com/v2/droplets/$DROPLET_ID" \\
    -H "Authorization: Bearer $DO_TOKEN" \\
    -H "Content-Type: application/json"

echo "Goodbye!"
`;
  }

  /**
   * Get available regions for farming
   */
  getAvailableRegions(): string[] {
    return [...DO_REGIONS];
  }
}
