import "dotenv/config";
import express from "express";
import cors from "cors";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { DataService } from "./data-service";
import { FarmingService } from "./farming-service";
import { GitHubFarmingService } from "./github-farming";
import { createRouter } from "./routes";

async function main() {
  const config = loadConfig();
  logger.info({ config }, "Pulse API starting");

  const app = express();
  const dataService = new DataService(config);

  // Initialize DO farming service for quick farming (optional)
  let farmingService: FarmingService | undefined;
  if (config.DO_API_TOKEN) {
    farmingService = new FarmingService(config);
    logger.info("DO Farming service initialized (quick farming only)");
  } else {
    logger.warn("DO API token not set - quick farming disabled");
  }

  // Initialize GitHub Actions farming service for continuous farming
  const githubFarmingService = new GitHubFarmingService();
  if (githubFarmingService.isAvailable()) {
    githubFarmingService.startScheduler();
    logger.info("GitHub Actions farming service initialized with background scheduler");
  } else {
    logger.warn("GITHUB_TOKEN not set - continuous farming disabled");
  }

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
        },
        "request completed",
      );
    });
    next();
  });

  // Routes
  app.use("/api", createRouter(dataService, farmingService, githubFarmingService));

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      name: "Shelby Pulse API",
      version: "0.2.0",
      endpoints: {
        health: "/api/health",
        stats: "/api/network/stats",
        recentBlobs: "/api/blobs/recent?limit=20",
        events: "/api/events/recent?limit=100",
        providers: "/api/providers",
        economy: "/api/economy",
        farming: {
          start: "POST /api/farming/start",
          status: "GET /api/farming/status",
          overview: "GET /api/farming/overview",
          stop: "POST /api/farming/stop",
          cleanup: "POST /api/farming/cleanup",
          faucet: "POST /api/farming/faucet",
        },
        continuousFarming: {
          start: "POST /api/farming/continuous/start",
          status: "GET /api/farming/continuous/status?walletAddress=0x...",
          stop: "POST /api/farming/continuous/stop",
          history: "GET /api/farming/continuous/history?walletAddress=0x...",
          regions: "GET /api/farming/continuous/regions",
        },
      },
      farmingEnabled: !!farmingService,
    });
  });

  // Error handler
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      logger.error({ err, path: req.path }, "Unhandled error");
      res.status(500).json({ error: "Internal server error" });
    },
  );

  // Start server
  app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, nodeUrl: config.APTOS_NODE_URL },
      "Pulse API listening",
    );
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully");
    githubFarmingService.stopScheduler();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully");
    githubFarmingService.stopScheduler();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error }, "Fatal API error");
  process.exit(1);
});
