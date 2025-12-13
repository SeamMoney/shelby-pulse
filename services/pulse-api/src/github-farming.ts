import { logger } from './logger';
import {
  createFarmingJob,
  getActiveFarmingJob,
  getFarmingJob,
  stopFarmingJob,
  updateFarmingJobAfterWave,
  getFarmingJobHistory,
  getFarmingWaves,
  getFarmingSummary,
  createFarmingWave,
  completeFarmingWave,
  type FarmingJob,
  type FarmingJobConfig,
} from './db';

// GitHub Actions configuration
const GITHUB_API_URL = 'https://api.github.com';
const REPO_OWNER = 'SeamMoney';
const REPO_NAME = 'shelby-pulse';
const WORKFLOW_FILE = 'farm-shelbyusd.yml';

// Farming estimates (conservative)
const JOBS_PER_WORKFLOW = 5;  // 5 parallel jobs in our workflow
const REQUESTS_PER_JOB = 50;
const SHELBYUSD_PER_REQUEST = 10;
const ESTIMATED_PER_RUN = JOBS_PER_WORKFLOW * REQUESTS_PER_JOB * SHELBYUSD_PER_REQUEST * 1e8; // in smallest units

// Default config for GitHub Actions farming
const DEFAULT_GITHUB_CONFIG: FarmingJobConfig = {
  regions: ['github-actions'], // Not used for GitHub, but needed for type
  dropletsPerRegion: 5, // Represents parallel jobs
  waveIntervalMs: 15 * 60 * 1000, // 15 minutes between workflow triggers
};

interface WorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

export class GitHubFarmingService {
  private githubToken: string | null;
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(githubToken?: string) {
    this.githubToken = githubToken || process.env.GITHUB_TOKEN || null;
    if (!this.githubToken) {
      logger.warn('GITHUB_TOKEN not set - GitHub Actions farming disabled');
    }
  }

  /**
   * Start the background scheduler
   */
  startScheduler(): void {
    if (!this.githubToken) {
      logger.warn('Cannot start GitHub farming scheduler - no token');
      return;
    }

    if (this.schedulerInterval) {
      logger.warn('GitHub farming scheduler already running');
      return;
    }

    logger.info('Starting GitHub Actions farming scheduler');
    // Check every 60 seconds for jobs that need a new wave
    this.schedulerInterval = setInterval(() => this.tick(), 60 * 1000);
    // Run immediately too
    this.tick();
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      logger.info('GitHub farming scheduler stopped');
    }
  }

  /**
   * Scheduler tick - check for active jobs and trigger workflows
   */
  private async tick(): Promise<void> {
    if (this.isProcessing || !this.githubToken) return;
    this.isProcessing = true;

    try {
      const activeJobs = await this.getActiveJobs();

      for (const job of activeJobs) {
        await this.processJob(job);
      }
    } catch (error) {
      logger.error({ error }, 'GitHub farming scheduler tick failed');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a farming job - trigger workflow if interval elapsed
   */
  private async processJob(job: FarmingJob): Promise<void> {
    const now = Date.now();
    const timeSinceLastWave = job.last_wave_at ? now - job.last_wave_at : Infinity;

    // Check if max waves reached
    if (job.config.maxWaves && job.waves_completed >= job.config.maxWaves) {
      logger.info({ jobId: job.id }, 'Job reached max waves, completing');
      stopFarmingJob(job.id, 'completed');
      return;
    }

    // Check if enough time has passed
    if (timeSinceLastWave < job.config.waveIntervalMs) {
      return;
    }

    // Trigger new workflow
    await this.triggerWorkflow(job);
  }

  /**
   * Trigger a GitHub Actions workflow for farming
   */
  private async triggerWorkflow(job: FarmingJob): Promise<boolean> {
    if (!this.githubToken) return false;

    const waveNumber = job.waves_completed + 1;

    try {
      const response = await fetch(
        `${GITHUB_API_URL}/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              wallet_address: job.wallet_address,
              num_requests: '50',
            },
          }),
        }
      );

      if (response.status === 204 || response.ok) {
        logger.info({ jobId: job.id, waveNumber }, 'Triggered GitHub Actions workflow');

        // Create wave record
        const wave = createFarmingWave(
          job.id,
          waveNumber,
          ['github-actions'],
          JOBS_PER_WORKFLOW
        );

        // Estimate completion (workflows run ~60 seconds)
        setTimeout(() => {
          completeFarmingWave(wave.id, JOBS_PER_WORKFLOW, 0, ESTIMATED_PER_RUN);
        }, 90 * 1000);

        // Update job stats
        updateFarmingJobAfterWave(job.id, JOBS_PER_WORKFLOW, 0, ESTIMATED_PER_RUN);

        return true;
      } else {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, 'Failed to trigger workflow');
        return false;
      }
    } catch (error) {
      logger.error({ error, jobId: job.id }, 'Failed to trigger GitHub workflow');
      return false;
    }
  }

  /**
   * Start a farming job
   */
  startFarming(walletAddress: string, config?: Partial<FarmingJobConfig>): FarmingJob {
    if (!this.githubToken) {
      throw new Error('GitHub Actions farming not configured (missing GITHUB_TOKEN)');
    }

    if (!walletAddress || !walletAddress.startsWith('0x')) {
      throw new Error('Invalid wallet address');
    }

    // Check for existing active job
    const existingJob = getActiveFarmingJob(walletAddress);
    if (existingJob) {
      logger.info({ jobId: existingJob.id }, 'Returning existing active job');
      return existingJob;
    }

    const fullConfig: FarmingJobConfig = {
      ...DEFAULT_GITHUB_CONFIG,
      ...config,
    };

    const job = createFarmingJob(walletAddress, fullConfig);
    logger.info({ jobId: job.id, walletAddress }, 'Started GitHub Actions farming job');

    // Trigger first workflow immediately
    this.triggerWorkflow(job);

    return job;
  }

  /**
   * Stop a farming job
   */
  stopFarming(jobId: string): void {
    const job = getFarmingJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    stopFarmingJob(jobId);
    logger.info({ jobId }, 'Stopped GitHub Actions farming job');
  }

  /**
   * Get active job for wallet
   */
  getActiveJob(walletAddress: string): FarmingJob | null {
    return getActiveFarmingJob(walletAddress);
  }

  /**
   * Get all active jobs
   */
  private getActiveJobs(): FarmingJob[] {
    const { getAllActiveFarmingJobs } = require('./db');
    return getAllActiveFarmingJobs();
  }

  /**
   * Get job status with waves
   */
  getJobStatus(jobId: string): {
    job: FarmingJob;
    waves: any[];
    estimatedYield: number;
    runningTime: string;
  } | null {
    const job = getFarmingJob(jobId);
    if (!job) return null;

    const waves = getFarmingWaves(jobId, 20);
    const runningTimeMs = job.stopped_at
      ? job.stopped_at - job.started_at
      : Date.now() - job.started_at;

    const hours = Math.floor(runningTimeMs / (60 * 60 * 1000));
    const minutes = Math.floor((runningTimeMs % (60 * 60 * 1000)) / (60 * 1000));
    const runningTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
      job,
      waves,
      estimatedYield: job.total_minted / 1e8,
      runningTime,
    };
  }

  /**
   * Get farming summary
   */
  getSummary() {
    return getFarmingSummary();
  }

  /**
   * Get job history for wallet
   */
  getHistory(walletAddress: string): FarmingJob[] {
    return getFarmingJobHistory(walletAddress);
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return !!this.githubToken;
  }
}
