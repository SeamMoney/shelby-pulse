import "dotenv/config";
import express from "express";
import cors from "cors";
import { loadConfig } from "./config.ts";
import { logger } from "./logger.ts";
import { DataService } from "./data-service.ts";
import { createRouter } from "./routes.ts";

async function main() {
  const config = loadConfig();
  logger.info({ config }, "Pulse API starting");

  const app = express();
  const dataService = new DataService(config);

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
  app.use("/api", createRouter(dataService));

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      name: "Shelby Pulse API",
      version: "0.1.0",
      endpoints: {
        health: "/api/health",
        stats: "/api/network/stats",
        recentBlobs: "/api/blobs/recent?limit=20",
        events: "/api/events/recent?limit=100",
        providers: "/api/providers",
      },
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
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully");
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ error }, "Fatal API error");
  process.exit(1);
});
