import { Router } from "express";
import type { DataService } from "./data-service";
import type { FarmingService } from "./farming-service";
import { logger } from "./logger";

export function createRouter(
  dataService: DataService,
  farmingService?: FarmingService
): Router {
  const router = Router();

  /**
   * GET /api/network/stats
   * Returns overall network statistics
   */
  router.get("/network/stats", async (req, res) => {
    try {
      const stats = await dataService.getNetworkStats();
      res.json(stats);
    } catch (error) {
      logger.error({ error }, "Failed to get network stats");
      res.status(500).json({ error: "Failed to fetch network statistics" });
    }
  });

  /**
   * GET /api/blobs/recent?limit=20
   * Returns recent blob data
   */
  router.get("/blobs/recent", async (req, res) => {
    try {
      const limit = Number.parseInt(req.query.limit as string) || 20;
      const blobs = await dataService.getRecentBlobs(Math.min(limit, 100));
      res.json(blobs);
    } catch (error) {
      logger.error({ error }, "Failed to get recent blobs");
      res.status(500).json({ error: "Failed to fetch recent blobs" });
    }
  });

  /**
   * GET /api/events/recent?limit=100
   * Returns recent blob events (for activity feed)
   */
  router.get("/events/recent", async (req, res) => {
    try {
      const limit = Number.parseInt(req.query.limit as string) || 100;
      const events = await dataService.getAllBlobEvents(Math.min(limit, 500));
      res.json(events);
    } catch (error) {
      logger.error({ error }, "Failed to get events");
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  /**
   * GET /api/providers
   * Returns storage provider information
   */
  router.get("/providers", async (req, res) => {
    try {
      const providers = await dataService.getStorageProviders();
      res.json(providers);
    } catch (error) {
      logger.error({ error }, "Failed to get providers");
      res.status(500).json({ error: "Failed to fetch storage providers" });
    }
  });

  /**
   * GET /api/health
   * Health check endpoint
   */
  router.get("/health", async (req, res) => {
    try {
      const health = await dataService.healthCheck();
      res.json(health);
    } catch (error) {
      logger.error({ error }, "Health check failed");
      res.status(500).json({ status: "unhealthy", timestamp: Date.now() });
    }
  });

  /**
   * GET /api/economy?refresh=true
   * Returns ShelbyUSD economy data (leaderboards, volume, earners, spenders)
   * Use refresh=true to bypass cache (for after farming completes)
   */
  router.get("/economy", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const economy = await dataService.getEconomyData(forceRefresh);
      res.json(economy);
    } catch (error) {
      logger.error({ error }, "Failed to get economy data");
      res.status(500).json({ error: "Failed to fetch economy data" });
    }
  });

  /**
   * GET /api/user/deposits?address=0x...&since_version=1234
   * Returns user's recent ShelbyUSD deposits with transaction hashes
   * Used for showing toast notifications with explorer links
   */
  router.get("/user/deposits", async (req, res) => {
    try {
      const address = req.query.address as string;
      const sinceVersion = req.query.since_version as string | undefined;
      const limit = Number.parseInt(req.query.limit as string) || 10;

      if (!address) {
        return res.status(400).json({ error: "address query parameter is required" });
      }

      const deposits = await dataService.getUserDeposits(address, sinceVersion, Math.min(limit, 50));
      res.json(deposits);
    } catch (error) {
      logger.error({ error }, "Failed to get user deposits");
      res.status(500).json({ error: "Failed to fetch user deposits" });
    }
  });

  /**
   * POST /api/cache/clear
   * Clear the cache (for debugging)
   */
  router.post("/cache/clear", (req, res) => {
    try {
      dataService.clearCache();
      res.json({ message: "Cache cleared successfully" });
    } catch (error) {
      logger.error({ error }, "Failed to clear cache");
      res.status(500).json({ error: "Failed to clear cache" });
    }
  });

  // ============================================
  // SYNC & DATABASE ENDPOINTS
  // ============================================

  /**
   * GET /api/sync/status
   * Get the current sync status and database stats
   */
  router.get("/sync/status", (req, res) => {
    try {
      const status = dataService.getSyncStatus();
      res.json(status);
    } catch (error) {
      logger.error({ error }, "Failed to get sync status");
      res.status(500).json({ error: "Failed to get sync status" });
    }
  });

  /**
   * POST /api/sync/force
   * Force a full resync from the blockchain
   * WARNING: This is an expensive operation - use sparingly
   */
  router.post("/sync/force", async (req, res) => {
    try {
      logger.info("Force resync requested via API");
      const count = await dataService.forceResync();
      res.json({
        message: "Full resync completed",
        activitiesSynced: count,
      });
    } catch (error) {
      logger.error({ error }, "Failed to force resync");
      res.status(500).json({ error: "Failed to force resync" });
    }
  });

  // ============================================
  // FARMING ENDPOINTS
  // ============================================

  /**
   * POST /api/farming/start
   * Start a farming session with cloud nodes
   */
  router.post("/farming/start", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const { walletAddress, numDroplets = 5 } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
      }

      const session = await farmingService.startFarming(walletAddress, numDroplets);
      res.json(session);
    } catch (error) {
      logger.error({ error }, "Failed to start farming");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start farming",
      });
    }
  });

  /**
   * GET /api/farming/status
   * Get status of farming sessions
   */
  router.get("/farming/status", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const sessionId = req.query.sessionId as string | undefined;
      const status = await farmingService.getFarmingStatus(sessionId);
      res.json(status);
    } catch (error) {
      logger.error({ error }, "Failed to get farming status");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get farming status",
      });
    }
  });

  /**
   * GET /api/farming/overview
   * Get overview of farming activity
   */
  router.get("/farming/overview", (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const overview = farmingService.getSessionsOverview();
      res.json(overview);
    } catch (error) {
      logger.error({ error }, "Failed to get farming overview");
      res.status(500).json({ error: "Failed to get farming overview" });
    }
  });

  /**
   * POST /api/farming/stop
   * Stop a farming session
   */
  router.post("/farming/stop", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const result = await farmingService.stopFarming(sessionId);
      res.json({ message: `Stopped session and terminated ${result.deleted} nodes` });
    } catch (error) {
      logger.error({ error }, "Failed to stop farming");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to stop farming",
      });
    }
  });

  /**
   * POST /api/farming/cleanup
   * Stop all farming nodes
   */
  router.post("/farming/cleanup", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const result = await farmingService.cleanupAllFarmingNodes();
      res.json({ message: `Terminated ${result.deleted} farming nodes` });
    } catch (error) {
      logger.error({ error }, "Failed to cleanup farming");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to cleanup farming",
      });
    }
  });

  /**
   * POST /api/farming/clear-sessions
   * Clear old/failed sessions from memory
   */
  router.post("/farming/clear-sessions", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const result = farmingService.clearOldSessions();
      res.json({ message: `Cleared ${result.cleared} old sessions` });
    } catch (error) {
      logger.error({ error }, "Failed to clear sessions");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to clear sessions",
      });
    }
  });

  /**
   * POST /api/farming/faucet
   * Direct faucet request from this server
   */
  router.post("/farming/faucet", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const { walletAddress } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
      }

      const result = await farmingService.requestFaucet(walletAddress);
      res.json(result);
    } catch (error) {
      logger.error({ error }, "Failed to request faucet");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to request faucet",
      });
    }
  });

  // ============================================
  // CONTINUOUS FARMING ENDPOINTS
  // ============================================

  /**
   * POST /api/farming/continuous/start
   * Start a continuous farming job
   */
  router.post("/farming/continuous/start", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const { walletAddress, regions, dropletsPerRegion, waveIntervalMinutes, maxWaves } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
      }

      const config: any = {};
      if (regions) config.regions = regions;
      if (dropletsPerRegion) config.dropletsPerRegion = dropletsPerRegion;
      if (waveIntervalMinutes) config.waveIntervalMs = waveIntervalMinutes * 60 * 1000;
      if (maxWaves) config.maxWaves = maxWaves;

      const job = farmingService.startContinuousFarming(walletAddress, config);
      res.json(job);
    } catch (error) {
      logger.error({ error }, "Failed to start continuous farming");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start continuous farming",
      });
    }
  });

  /**
   * GET /api/farming/continuous/status
   * Get status of continuous farming job(s)
   */
  router.get("/farming/continuous/status", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const jobId = req.query.jobId as string | undefined;
      const walletAddress = req.query.walletAddress as string | undefined;

      if (jobId) {
        // Get specific job status
        const status = farmingService.getContinuousJobStatus(jobId);
        if (!status) {
          return res.status(404).json({ error: "Job not found" });
        }
        res.json(status);
      } else if (walletAddress) {
        // Get active job for wallet
        const job = farmingService.getActiveContinuousJob(walletAddress);
        if (!job) {
          return res.json({ active: false, job: null });
        }
        const status = farmingService.getContinuousJobStatus(job.id);
        res.json({ active: true, ...status });
      } else {
        // Get global summary
        const summary = farmingService.getContinuousFarmingSummary();
        res.json(summary);
      }
    } catch (error) {
      logger.error({ error }, "Failed to get continuous farming status");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get continuous farming status",
      });
    }
  });

  /**
   * POST /api/farming/continuous/stop
   * Stop a continuous farming job
   */
  router.post("/farming/continuous/stop", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const { jobId } = req.body;

      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      farmingService.stopContinuousFarming(jobId);
      res.json({ message: "Job stopped successfully" });
    } catch (error) {
      logger.error({ error }, "Failed to stop continuous farming");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to stop continuous farming",
      });
    }
  });

  /**
   * GET /api/farming/continuous/history
   * Get farming job history for a wallet
   */
  router.get("/farming/continuous/history", async (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const walletAddress = req.query.walletAddress as string;

      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
      }

      const history = farmingService.getContinuousJobHistory(walletAddress);
      res.json(history);
    } catch (error) {
      logger.error({ error }, "Failed to get farming history");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get farming history",
      });
    }
  });

  /**
   * GET /api/farming/continuous/regions
   * Get available regions for farming
   */
  router.get("/farming/continuous/regions", (req, res) => {
    if (!farmingService) {
      return res.status(503).json({ error: "Farming service not available" });
    }

    try {
      const regions = farmingService.getAvailableRegions();
      res.json({ regions });
    } catch (error) {
      logger.error({ error }, "Failed to get regions");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get regions",
      });
    }
  });

  return router;
}
