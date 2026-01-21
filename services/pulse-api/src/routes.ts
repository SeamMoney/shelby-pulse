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

      logger.info(
        { filename: file.originalname, size: file.size },
        "Received file for upload"
      );

      const result = await uploadService.uploadFile(file.buffer, file.originalname);

      res.json({
        success: true,
        url: result.url,
        viewerUrl: result.viewerUrl,
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
      maxFileSize: "2GB",
      allowedTypes: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif", "mp4", "webm", "mov", "avi", "mkv", "pdf"],
      expiration: "1 year",
    });
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

      // Generate the appropriate embed element
      let embedHtml = '';
      if (isImage) {
        embedHtml = `<img src="${viewUrl}" alt="${filename}" style="max-width: 100%; max-height: 80vh; object-fit: contain;" />`;
      } else if (isVideo) {
        embedHtml = `<video src="${viewUrl}" controls autoplay style="max-width: 100%; max-height: 80vh;"></video>`;
      } else if (isPdf) {
        embedHtml = `<iframe src="${viewUrl}" style="width: 100%; height: 80vh; border: none;"></iframe>`;
      } else {
        embedHtml = `<p>Preview not available for this file type.</p>`;
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename} - Shelby Share</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 1rem 1.5rem;
      background: #111;
      border-bottom: 1px solid #222;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .file-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
    .file-info h1 {
      font-size: 1rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 400px;
    }
    .brand {
      color: #666;
      font-size: 0.875rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover {
      background: #2563eb;
    }
    .btn-secondary {
      background: #222;
      color: #fff;
      border: 1px solid #333;
    }
    .btn-secondary:hover {
      background: #333;
    }
    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
      overflow: auto;
    }
    .content {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
    }
    img, video {
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    }
    svg { flex-shrink: 0; }
  </style>
</head>
<body>
  <header>
    <div class="file-info">
      <h1>${filename}</h1>
      <span class="brand">Shelby Share</span>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" onclick="copyLink()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span id="copyText">Copy Link</span>
      </button>
      <a href="${downloadUrl}" download="${filename}" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </a>
    </div>
  </header>
  <main>
    <div class="content">
      ${embedHtml}
    </div>
  </main>
  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.getElementById('copyText');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Link', 2000);
      });
    }
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
