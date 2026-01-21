import { Router } from "express";
import multer from "multer";
import type { DataService } from "./data-service";
import type { FarmingService } from "./farming-service";
import type { GitHubFarmingService } from "./github-farming";
import type { UploadService } from "./upload-service";
import { logger } from "./logger";
import { resetFarmingStats } from "./db";

// In-memory session storage for folder links
interface SessionFile {
  blobName: string;
  originalName: string;
  size: number;
  url: string;
  viewerUrl: string;
  uploadedAt: string;
  address: string;
}

interface Session {
  id: string;
  files: SessionFile[];
  createdAt: string;
}

// Store sessions in memory (they persist until server restart)
const sessions = new Map<string, Session>();

// Configure multer for memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max
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

      // Get session ID from request body (optional)
      const sessionId = req.body.sessionId;

      logger.info(
        { filename: file.originalname, size: file.size, sessionId },
        "Received file for upload"
      );

      const result = await uploadService.uploadFile(file.buffer, file.originalname);

      // If a session ID was provided, add the file to the session
      if (sessionId) {
        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, {
            id: sessionId,
            files: [],
            createdAt: new Date().toISOString(),
          });
        }
        const session = sessions.get(sessionId)!;
        session.files.push({
          blobName: result.blobName,
          originalName: file.originalname,
          size: result.size,
          url: result.url,
          viewerUrl: result.viewerUrl,
          uploadedAt: new Date().toISOString(),
          address: result.owner,
        });
        logger.info({ sessionId, fileCount: session.files.length }, "Added file to session");
      }

      res.json({
        success: true,
        url: result.url,
        viewerUrl: result.viewerUrl,
        blobName: result.blobName,
        size: result.size,
        expiresAt: result.expiresAt,
        sessionId,
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
      maxFileSize: "2GB",
      allowedTypes: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "mp4", "webm", "mov", "avi", "mkv", "pdf"],
      expiration: "1 year",
    });
  });

  /**
   * GET /api/share/folder/:sessionId
   * HTML page showing all files in a session (like a Google Drive folder)
   */
  router.get("/share/folder/:sessionId", (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).send("Missing session ID");
      }

      const session = sessions.get(sessionId);

      if (!session || session.files.length === 0) {
        // Return a nice "folder not found" page
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Folder Not Found - Shelby Share</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      background: #0d0d0d;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon { color: #F25D94; font-size: 4rem; margin-bottom: 1rem; }
    h1 { color: #F25D94; margin-bottom: 0.5rem; }
    p { color: #888; margin-bottom: 1.5rem; }
    a {
      color: #F25D94;
      text-decoration: none;
      border: 1px solid #F25D94;
      padding: 0.5rem 1rem;
      border-radius: 4px;
    }
    a:hover { background: rgba(242, 93, 148, 0.1); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📁</div>
    <h1>Folder Not Found</h1>
    <p>This folder doesn't exist or has expired.</p>
    <a href="/">← Back to Shelby Pulse</a>
  </div>
</body>
</html>`;
        return res.status(404).send(html);
      }

      // Format file size
      const formatSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      };

      // Get file icon based on extension
      const getFileIcon = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'];
        const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
        if (imageExts.includes(ext)) return '🖼️';
        if (videoExts.includes(ext)) return '🎬';
        if (ext === 'pdf') return '📄';
        return '📁';
      };

      // Generate file list HTML
      const filesHtml = session.files.map(file => `
        <div class="file-item">
          <div class="file-icon">${getFileIcon(file.originalName)}</div>
          <div class="file-info">
            <div class="file-name">${file.originalName}</div>
            <div class="file-meta">${formatSize(file.size)}</div>
          </div>
          <div class="file-actions">
            <a href="${file.viewerUrl}" target="_blank" class="btn btn-view" title="View">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
            <a href="${file.url}" download class="btn btn-download" title="Download">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
      `).join('');

      const totalSize = session.files.reduce((sum, f) => sum + f.size, 0);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0d0d0d">
  <title>Shared Folder - Shelby Share</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      background: #0d0d0d;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 1rem;
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
    }

    /* Header */
    header {
      text-align: center;
      padding: 1.5rem 0 1rem;
      border-bottom: 1px solid #333;
      margin-bottom: 1.5rem;
    }
    .brand {
      background: linear-gradient(135deg, #F25D94 0%, #7D56F4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    .subtitle { color: #666; font-size: 0.85rem; }

    /* Folder info */
    .folder-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .folder-icon {
      font-size: 2rem;
    }
    .folder-info h1 {
      font-size: 1rem;
      color: #F25D94;
      margin-bottom: 0.25rem;
    }
    .folder-stats {
      font-size: 0.8rem;
      color: #888;
    }
    .folder-stats span {
      margin-right: 1rem;
    }

    /* Copy link button */
    .copy-section {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .link-display {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 0.6rem 0.75rem;
      font-size: 0.75rem;
      color: #888;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-copy {
      background: linear-gradient(135deg, #F25D94 0%, #7D56F4 100%);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 0.6rem 1rem;
      font-family: inherit;
      font-size: 0.8rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      transition: opacity 0.15s;
    }
    .btn-copy:hover { opacity: 0.9; }

    /* File list */
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .file-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      transition: border-color 0.15s;
    }
    .file-item:hover {
      border-color: #F25D94;
    }
    .file-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }
    .file-info {
      flex: 1;
      min-width: 0;
    }
    .file-name {
      font-size: 0.9rem;
      color: #e0e0e0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-meta {
      font-size: 0.75rem;
      color: #666;
      margin-top: 0.125rem;
    }
    .file-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      text-decoration: none;
      transition: all 0.15s;
    }
    .btn-view {
      background: rgba(242, 93, 148, 0.1);
      color: #F25D94;
      border: 1px solid #F25D94;
    }
    .btn-view:hover {
      background: rgba(242, 93, 148, 0.2);
    }
    .btn-download {
      background: rgba(125, 86, 244, 0.1);
      color: #7D56F4;
      border: 1px solid #7D56F4;
    }
    .btn-download:hover {
      background: rgba(125, 86, 244, 0.2);
    }

    /* Footer */
    footer {
      text-align: center;
      padding: 2rem 0 1rem;
      color: #444;
      font-size: 0.75rem;
    }
    footer a {
      color: #F25D94;
      text-decoration: none;
    }

    /* ASCII decoration */
    .ascii-border {
      color: #333;
      font-size: 0.7rem;
      text-align: center;
      margin: 1rem 0;
      user-select: none;
    }

    @media (max-width: 480px) {
      body { padding: 0.75rem; }
      .folder-header { padding: 0.75rem; }
      .file-item { padding: 0.6rem 0.75rem; }
      .file-name { font-size: 0.85rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">Shelby Share</div>
      <div class="subtitle">Decentralized File Sharing</div>
    </header>

    <div class="folder-header">
      <div class="folder-icon">📁</div>
      <div class="folder-info">
        <h1>Shared Folder</h1>
        <div class="folder-stats">
          <span>${session.files.length} file${session.files.length !== 1 ? 's' : ''}</span>
          <span>${formatSize(totalSize)} total</span>
        </div>
      </div>
    </div>

    <div class="copy-section">
      <div class="link-display">${req.protocol}://${req.get('host')}${req.originalUrl}</div>
      <button class="btn-copy" onclick="copyLink()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span id="copyText">Copy</span>
      </button>
    </div>

    <div class="ascii-border">┌${'─'.repeat(40)}┐</div>

    <div class="file-list">
      ${filesHtml}
    </div>

    <div class="ascii-border">└${'─'.repeat(40)}┘</div>

    <footer>
      Stored on <a href="https://shelby.xyz" target="_blank">Shelby Protocol</a>
    </footer>
  </div>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.getElementById('copyText');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        }
      });
    }
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      logger.error({ error }, "Failed to render folder page");
      res.status(500).send("Failed to load folder");
    }
  });

  /**
   * GET /api/share/view/:address/:filename
   * Proxy file from Shelby Protocol with Content-Disposition: inline
   * This allows files to be displayed in browser instead of downloaded
   */
  router.get("/share/view/:address/:filename", async (req, res) => {
    try {
      const { address, filename } = req.params;

      if (!address || !filename) {
        return res.status(400).json({ error: "address and filename are required" });
      }

      // Determine content type from file extension
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const contentTypeMap: Record<string, string> = {
        // Images
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        avif: 'image/avif',
        // Videos
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        mkv: 'video/x-matroska',
        // Documents
        pdf: 'application/pdf',
      };

      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // Fetch from Shelby Protocol
      const shelbyUrl = `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${address}/${encodeURIComponent(filename)}`;

      logger.info({ shelbyUrl, contentType }, "Proxying file for inline view");

      const response = await fetch(shelbyUrl);

      if (!response.ok) {
        logger.error({ status: response.status, shelbyUrl }, "Failed to fetch from Shelby");
        return res.status(response.status).json({
          error: `Failed to fetch file: ${response.statusText}`
        });
      }

      // Set headers for inline display
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      // Cache for 1 hour (files are immutable on Shelby)
      res.setHeader('Cache-Control', 'public, max-age=3600');

      // Stream the response
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      logger.error({ error }, "Failed to proxy file for viewing");
      res.status(500).json({ error: "Failed to fetch file" });
    }
  });

  /**
   * GET /api/share/viewer/:address/:filename
   * HTML viewer page that displays the file with a download button
   */
  router.get("/share/viewer/:address/:filename", async (req, res) => {
    try {
      const { address, filename } = req.params;

      if (!address || !filename) {
        return res.status(400).send("Missing address or filename");
      }

      // Determine file type from extension
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'];
      const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
      const pdfExts = ['pdf'];

      const isImage = imageExts.includes(ext);
      const isVideo = videoExts.includes(ext);
      const isPdf = pdfExts.includes(ext);

      // URLs for viewing and downloading
      const viewUrl = `/api/share/view/${address}/${encodeURIComponent(filename)}`;
      const downloadUrl = `https://api.shelbynet.shelby.xyz/shelby/v1/blobs/${address}/${encodeURIComponent(filename)}`;

      // Generate the appropriate embed element based on file type
      let embedHtml = '';
      let extraStyles = '';
      let extraScripts = '';

      if (isImage) {
        embedHtml = `
          <div class="media-container image-container">
            <img src="${viewUrl}" alt="${filename}" id="mainImage" />
          </div>`;
      } else if (isVideo) {
        embedHtml = `
          <div class="media-container video-container">
            <video src="${viewUrl}" controls playsinline webkit-playsinline id="mainVideo"></video>
          </div>`;
        extraScripts = `
          // Auto-play video when loaded (muted for mobile autoplay policy)
          const video = document.getElementById('mainVideo');
          video.muted = true;
          video.play().catch(() => {});
          // Show controls to unmute
          video.addEventListener('click', () => { video.muted = false; });
        `;
      } else if (isPdf) {
        // For mobile, we need a different approach since iframes with PDFs don't work well
        embedHtml = `
          <div class="media-container pdf-container">
            <iframe src="${viewUrl}" id="pdfFrame" class="pdf-desktop"></iframe>
            <div class="pdf-mobile">
              <div class="pdf-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <p class="pdf-filename">${filename}</p>
              <p class="pdf-hint">Tap the button below to view or download</p>
              <a href="${viewUrl}" target="_blank" class="btn btn-primary btn-large">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Open PDF
              </a>
            </div>
          </div>`;
        extraStyles = `
          .pdf-desktop { display: block; }
          .pdf-mobile { display: none; }
          @media (max-width: 768px) {
            .pdf-desktop { display: none; }
            .pdf-mobile {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              padding: 2rem;
              gap: 1rem;
            }
            .pdf-icon { color: #F25D94; margin-bottom: 0.5rem; }
            .pdf-filename { font-size: 1.1rem; font-weight: 500; word-break: break-all; color: #1a1a1a; }
            .pdf-hint { color: #666; font-size: 0.9rem; }
          }
        `;
      } else {
        embedHtml = `
          <div class="media-container unsupported">
            <div class="unsupported-content">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              <p>${filename}</p>
              <p class="hint">Preview not available</p>
            </div>
          </div>`;
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <meta name="theme-color" content="#FFE4F0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <title>${filename} - Shelby Share</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #FFE4F0;
      color: #1a1a1a;
      min-height: 100vh;
      min-height: -webkit-fill-available;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    header {
      padding: 0.875rem 1rem;
      background: #FFF0F5;
      border-bottom: 1px solid #FFC2E1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
      z-index: 10;
    }
    .file-info {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
      flex: 1;
    }
    .file-info h1 {
      font-size: 0.9rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #1a1a1a;
    }
    .brand {
      background: linear-gradient(135deg, #F25D94 0%, #7D56F4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.6rem 0.875rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .btn-primary {
      background: linear-gradient(135deg, #F25D94 0%, #7D56F4 100%);
      color: white;
    }
    .btn-primary:hover, .btn-primary:active {
      opacity: 0.9;
      transform: scale(0.98);
    }
    .btn-secondary {
      background: #FFF0F5;
      color: #1a1a1a;
      border: 1px solid #FFC2E1;
    }
    .btn-secondary:hover, .btn-secondary:active {
      background: #FFE4F0;
    }
    .btn-large {
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
      gap: 0.5rem;
    }
    .btn svg { flex-shrink: 0; }

    /* Main content area */
    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      padding: 1rem;
      background: #FFE4F0;
    }

    /* Media containers */
    .media-container {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
    }

    /* Images */
    .image-container img {
      max-width: 100%;
      max-height: calc(100vh - 120px);
      max-height: calc(100dvh - 120px);
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(242, 93, 148, 0.2);
      border: 1px solid #FFC2E1;
    }

    /* Videos */
    .video-container video {
      max-width: 100%;
      max-height: calc(100vh - 120px);
      max-height: calc(100dvh - 120px);
      width: auto;
      height: auto;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(242, 93, 148, 0.2);
      border: 1px solid #FFC2E1;
      background: #000;
    }

    /* PDFs */
    .pdf-container iframe {
      width: 100%;
      height: calc(100vh - 120px);
      height: calc(100dvh - 120px);
      border: 1px solid #FFC2E1;
      border-radius: 12px;
      background: #fff;
    }

    /* Unsupported files */
    .unsupported-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      color: #7D56F4;
      text-align: center;
    }
    .unsupported-content p { font-size: 1rem; color: #1a1a1a; }
    .unsupported-content .hint { font-size: 0.875rem; color: #666; }

    /* Mobile adjustments */
    @media (max-width: 480px) {
      header {
        padding: 0.75rem;
      }
      .file-info h1 {
        font-size: 0.85rem;
      }
      .btn {
        padding: 0.55rem 0.7rem;
        font-size: 0.75rem;
      }
      .btn span {
        display: none;
      }
      .btn svg {
        width: 18px;
        height: 18px;
      }
      main {
        padding: 0.5rem;
      }
      .image-container img,
      .video-container video {
        max-height: calc(100vh - 100px);
        max-height: calc(100dvh - 100px);
        border-radius: 8px;
      }
    }

    /* Landscape mobile */
    @media (max-height: 500px) and (orientation: landscape) {
      header {
        padding: 0.5rem 1rem;
      }
      .file-info h1 {
        font-size: 0.8rem;
      }
      .brand {
        display: none;
      }
      main {
        padding: 0.5rem;
      }
      .image-container img,
      .video-container video {
        max-height: calc(100vh - 70px);
        max-height: calc(100dvh - 70px);
      }
    }

    ${extraStyles}
  </style>
</head>
<body>
  <header>
    <div class="file-info">
      <h1>${filename}</h1>
      <span class="brand">Shelby Share</span>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" onclick="copyLink()" aria-label="Copy link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span id="copyText">Copy</span>
      </button>
      <a href="${downloadUrl}" download="${filename}" class="btn btn-primary" aria-label="Download file">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>Download</span>
      </a>
    </div>
  </header>
  <main>
    ${embedHtml}
  </main>
  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.getElementById('copyText');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        }
      }).catch(() => {
        // Fallback for older browsers
        const input = document.createElement('input');
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        const btn = document.getElementById('copyText');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        }
      });
    }
    ${extraScripts}
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      logger.error({ error }, "Failed to render viewer page");
      res.status(500).send("Failed to load viewer");
    }
  });

  return router;
}
