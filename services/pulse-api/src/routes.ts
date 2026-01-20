import { Router } from "express";
import multer from "multer";
import type { DataService } from "./data-service";
import type { FarmingService } from "./farming-service";
import type { GitHubFarmingService } from "./github-farming";
import type { UploadService } from "./upload-service";
import { logger } from "./logger";
import { resetFarmingStats } from "./db";

// Configure multer for memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max for web uploads
    files: 5, // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and common file types
    const allowedTypes = [
      // Images
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/x-icon",
      "image/avif",
      // Videos
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-matroska",
      // Documents
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

export function createRouter(
  dataService: DataService,
  farmingService?: FarmingService,
  githubFarmingService?: GitHubFarmingService,
  uploadService?: UploadService
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
   * GET /api/analytics
   * Returns storage analytics - file types breakdown and top storage users
   */
  router.get("/analytics", async (req, res) => {
    try {
      const analytics = await dataService.getAnalytics();
      res.json(analytics);
    } catch (error) {
      logger.error({ error }, "Failed to get analytics data");
      res.status(500).json({ error: "Failed to fetch analytics data" });
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

  /**
   * POST /api/farming/reset-stats
   * Reset farming stats after a network reset
   * Keeps jobs active but zeroes out cumulative stats (waves, minted amounts)
   */
  router.post("/farming/reset-stats", async (req, res) => {
    try {
      logger.info("Farming stats reset requested via API");
      const result = resetFarmingStats();
      res.json({
        message: "Farming stats reset complete",
        ...result,
      });
    } catch (error) {
      logger.error({ error }, "Failed to reset farming stats");
      res.status(500).json({ error: "Failed to reset farming stats" });
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
  // CONTINUOUS FARMING ENDPOINTS (GitHub Actions)
  // ============================================

  /**
   * POST /api/farming/continuous/start
   * Start a continuous farming job via GitHub Actions
   */
  router.post("/farming/continuous/start", async (req, res) => {
    if (!githubFarmingService || !githubFarmingService.isAvailable()) {
      return res.status(503).json({ error: "GitHub Actions farming not available (GITHUB_TOKEN not set)" });
    }

    try {
      const { walletAddress, waveIntervalMinutes, maxWaves } = req.body;

      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
      }

      const config: { waveIntervalMs?: number; maxWaves?: number } = {};
      if (waveIntervalMinutes) config.waveIntervalMs = waveIntervalMinutes * 60 * 1000;
      if (maxWaves) config.maxWaves = maxWaves;

      const job = githubFarmingService.startFarming(walletAddress, config);
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
    if (!githubFarmingService) {
      return res.status(503).json({ error: "GitHub Actions farming not available" });
    }

    try {
      const jobId = req.query.jobId as string | undefined;
      const walletAddress = req.query.walletAddress as string | undefined;

      if (jobId) {
        // Get specific job status
        const status = githubFarmingService.getJobStatus(jobId);
        if (!status) {
          return res.status(404).json({ error: "Job not found" });
        }
        res.json(status);
      } else if (walletAddress) {
        // Get active job for wallet
        const job = githubFarmingService.getActiveJob(walletAddress);
        if (!job) {
          return res.json({ active: false, job: null });
        }
        const status = githubFarmingService.getJobStatus(job.id);
        res.json({ active: true, ...status });
      } else {
        // Get global summary
        const summary = githubFarmingService.getSummary();
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
    if (!githubFarmingService) {
      return res.status(503).json({ error: "GitHub Actions farming not available" });
    }

    try {
      const { jobId } = req.body;

      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      githubFarmingService.stopFarming(jobId);
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
    if (!githubFarmingService) {
      return res.status(503).json({ error: "GitHub Actions farming not available" });
    }

    try {
      const walletAddress = req.query.walletAddress as string;

      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
      }

      const history = githubFarmingService.getHistory(walletAddress);
      res.json(history);
    } catch (error) {
      logger.error({ error }, "Failed to get farming history");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get farming history",
      });
    }
  });

  /**
   * GET /api/farming/continuous/info
   * Get info about the GitHub Actions farming setup
   */
  router.get("/farming/continuous/info", (req, res) => {
    res.json({
      type: "github-actions",
      available: githubFarmingService?.isAvailable() ?? false,
      config: {
        parallelJobs: 5,
        requestsPerJob: 50,
        shelbyUsdPerRequest: 10,
        estimatedPerWave: 2500,
        waveIntervalMinutes: 15,
      },
      description: "Farming runs via GitHub Actions workflows, providing free compute with different IPs per job",
    });
  });

  // ============================================
  // SHARE/UPLOAD ENDPOINTS
  // ============================================

  /**
   * POST /api/share/upload
   * Upload a file to Shelby (no wallet needed - server pays)
   */
  router.post("/share/upload", upload.single("file"), async (req, res) => {
    if (!uploadService || !uploadService.isAvailable()) {
      return res.status(503).json({
        error: "Upload service not available",
        message: "SHELBY_PRIVATE_KEY not configured",
      });
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      logger.info(
        { filename: file.originalname, size: file.size },
        "Received file for upload"
      );

      const result = await uploadService.uploadFile(file.buffer, file.originalname);

      res.json({
        success: true,
        url: result.url,
        blobName: result.blobName,
        size: result.size,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error({ error }, "Failed to upload file");
      res.status(500).json({
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  });

  /**
   * GET /api/share/info
   * Get info about the share/upload service
   */
  router.get("/share/info", (req, res) => {
    res.json({
      available: uploadService?.isAvailable() ?? false,
      uploaderAddress: uploadService?.getAddress() ?? null,
      maxFileSize: "50MB",
      allowedTypes: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "mp4", "webm", "mov", "avi", "mkv", "pdf"],
      expiration: "1 year",
    });
  });

  return router;
}
