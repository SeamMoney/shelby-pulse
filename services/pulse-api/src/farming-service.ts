import type { ApiConfig } from "./config";
import { logger } from "./logger";

const FAUCET_URL = "https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd";
const DEFAULT_AMOUNT = 1000000000; // 10 ShelbyUSD (8 decimals)
const REQUESTS_PER_NODE = 50; // Max 50 requests per IP per day

interface NodeInfo {
  id: number;
  name: string;
  status: string;
  ip?: string;
  createdAt: string;
  farmingStatus: "pending" | "running" | "completed" | "failed";
  farmedAmount: number;
  successfulRequests: number;
  failedRequests: number;
}

interface FarmingSession {
  id: string;
  walletAddress: string;
  startedAt: string;
  droplets: NodeInfo[];
  totalFarmed: number;
  status: "starting" | "running" | "completed" | "stopped" | "failed";
}

// In-memory storage for farming sessions
const farmingSessions: Map<string, FarmingSession> = new Map();

export class FarmingService {
  private config: ApiConfig;
  private cloudApiUrl = "https://api.digitalocean.com/v2";

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private async cloudRequest(
    endpoint: string,
    method: string = "GET",
    body?: unknown
  ): Promise<unknown> {
    if (!this.config.DO_API_TOKEN) {
      throw new Error("Cloud API not configured");
    }

    const response = await fetch(`${this.cloudApiUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.DO_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private generateFarmingScript(walletAddress: string): string {
    return `#!/bin/bash
# ShelbyUSD Farming Script
WALLET="${walletAddress}"
FAUCET_URL="${FAUCET_URL}"
AMOUNT=${DEFAULT_AMOUNT}
REQUESTS=${REQUESTS_PER_NODE}
DELAY=2

echo "Starting ShelbyUSD farming to $WALLET"
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

# Signal completion
echo "{\\"success\\": $success, \\"failed\\": $failed, \\"total\\": $((success * 10))}" > /root/farming_complete.json
`;
  }

  async startFarming(
    walletAddress: string,
    numNodes: number = 5
  ): Promise<FarmingSession> {
    if (!this.config.DO_API_TOKEN) {
      throw new Error("Cloud infrastructure not configured");
    }

    if (!walletAddress || !walletAddress.startsWith("0x")) {
      throw new Error("Invalid wallet address");
    }

    if (numNodes < 1 || numNodes > 20) {
      throw new Error("Number of nodes must be between 1 and 20");
    }

    const sessionId = `farm-${Date.now()}`;
    const session: FarmingSession = {
      id: sessionId,
      walletAddress,
      startedAt: new Date().toISOString(),
      droplets: [],
      totalFarmed: 0,
      status: "starting",
    };

    farmingSessions.set(sessionId, session);

    logger.info({ sessionId, walletAddress, numNodes }, "Starting farming session");

    // Create nodes in parallel
    const nodePromises = [];
    for (let i = 1; i <= numNodes; i++) {
      nodePromises.push(this.createFarmingNode(walletAddress, i, sessionId));
    }

    try {
      const results = await Promise.allSettled(nodePromises);

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          session.droplets.push(result.value);
        } else if (result.status === "rejected") {
          logger.error({ error: result.reason }, "Failed to create node");
        }
      }

      session.status = session.droplets.length > 0 ? "running" : "failed";
      farmingSessions.set(sessionId, session);

      logger.info(
        { sessionId, nodesCreated: session.droplets.length },
        "Farming session started"
      );

      return session;
    } catch (error) {
      session.status = "failed";
      farmingSessions.set(sessionId, session);
      throw error;
    }
  }

  private async createFarmingNode(
    walletAddress: string,
    index: number,
    sessionId: string
  ): Promise<NodeInfo> {
    const name = `shelby-node-${sessionId.split("-")[1]}-${index}`;
    const farmingScript = this.generateFarmingScript(walletAddress);

    const createResponse = (await this.cloudRequest("/droplets", "POST", {
      name,
      region: "sfo3",
      size: "s-1vcpu-512mb-10gb",
      image: "ubuntu-24-04-x64",
      user_data: farmingScript,
      tags: ["shelby-farmer", sessionId],
    })) as { droplet: { id: number; name: string; status: string; created_at: string } };

    return {
      id: createResponse.droplet.id,
      name: createResponse.droplet.name,
      status: createResponse.droplet.status,
      createdAt: createResponse.droplet.created_at,
      farmingStatus: "pending",
      farmedAmount: 0,
      successfulRequests: 0,
      failedRequests: 0,
    };
  }

  async getFarmingStatus(sessionId?: string): Promise<FarmingSession | FarmingSession[]> {
    if (sessionId) {
      const session = farmingSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Update node statuses
      await this.updateNodeStatuses(session);
      return session;
    }

    // Return all sessions
    const sessions = Array.from(farmingSessions.values());
    for (const session of sessions) {
      await this.updateNodeStatuses(session);
    }
    return sessions;
  }

  private async updateNodeStatuses(session: FarmingSession): Promise<void> {
    if (!this.config.DO_API_TOKEN || session.droplets.length === 0) {
      return;
    }

    try {
      for (const node of session.droplets) {
        const response = (await this.cloudRequest(`/droplets/${node.id}`)) as {
          droplet: { status: string; networks?: { v4?: Array<{ ip_address: string; type: string }> } };
        };

        node.status = response.droplet.status;

        // Get public IP
        const publicNetwork = response.droplet.networks?.v4?.find(
          (n) => n.type === "public"
        );
        if (publicNetwork) {
          node.ip = publicNetwork.ip_address;
        }

        // Update farming status based on node status
        if (node.status === "active" && node.farmingStatus === "pending") {
          node.farmingStatus = "running";
        }
      }

      // Check if all nodes completed
      const allCompleted = session.droplets.every(
        (d) => d.farmingStatus === "completed" || d.farmingStatus === "failed"
      );
      if (allCompleted && session.status === "running") {
        session.status = "completed";
      }

      // Calculate total farmed (estimate: 500 SHELBY_USD per successful node)
      session.totalFarmed = session.droplets.reduce(
        (sum, d) => sum + d.farmedAmount,
        0
      );
    } catch (error) {
      logger.error({ error, sessionId: session.id }, "Failed to update node statuses");
    }
  }

  async stopFarming(sessionId: string): Promise<{ deleted: number }> {
    const session = farmingSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    let deleted = 0;
    for (const node of session.droplets) {
      try {
        await this.cloudRequest(`/droplets/${node.id}`, "DELETE");
        deleted++;
        logger.info({ nodeId: node.id, name: node.name }, "Deleted farming node");
      } catch (error) {
        logger.error({ error, nodeId: node.id }, "Failed to delete node");
      }
    }

    session.status = "stopped";
    farmingSessions.set(sessionId, session);

    return { deleted };
  }

  async cleanupAllFarmingNodes(): Promise<{ deleted: number }> {
    if (!this.config.DO_API_TOKEN) {
      throw new Error("Cloud infrastructure not configured");
    }

    try {
      // List all nodes with shelby-farmer tag
      const response = (await this.cloudRequest("/droplets?tag_name=shelby-farmer")) as {
        droplets: Array<{ id: number; name: string }>;
      };

      let deleted = 0;
      for (const node of response.droplets) {
        try {
          await this.cloudRequest(`/droplets/${node.id}`, "DELETE");
          deleted++;
          logger.info({ nodeId: node.id, name: node.name }, "Deleted farming node");
        } catch (error) {
          logger.error({ error, nodeId: node.id }, "Failed to delete node");
        }
      }

      // Clear all sessions
      farmingSessions.clear();

      return { deleted };
    } catch (error) {
      logger.error({ error }, "Failed to cleanup farming nodes");
      throw error;
    }
  }

  // Direct faucet request (for local farming without cloud nodes)
  async requestFaucet(walletAddress: string): Promise<{ txn_hashes: string[] }> {
    const response = await fetch(FAUCET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        Origin: "https://docs.shelby.xyz",
        Referer: "https://docs.shelby.xyz/",
      },
      body: JSON.stringify({ address: walletAddress, amount: DEFAULT_AMOUNT }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          data.rejection_reasons?.[0]?.reason ||
          `HTTP ${response.status}`
      );
    }

    return data;
  }

  getSessionsOverview(): {
    totalSessions: number;
    activeSessions: number;
    totalDroplets: number;
    estimatedTotalFarmed: number;
  } {
    const sessions = Array.from(farmingSessions.values());
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => s.status === "running").length,
      totalDroplets: sessions.reduce((sum, s) => sum + s.droplets.length, 0),
      estimatedTotalFarmed: sessions.reduce((sum, s) => sum + s.totalFarmed, 0),
    };
  }
}
