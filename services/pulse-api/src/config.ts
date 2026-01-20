import { z } from "zod";

const configSchema = z.object({
  APTOS_NETWORK: z.string().default("custom"),
  APTOS_NODE_URL: z
    .string()
    .default("https://api.shelbynet.shelby.xyz/v1"),
  APTOS_INDEXER_URL: z
    .string()
    .optional()
    .default("https://api.shelbynet.shelby.xyz/v1/graphql"),
  APTOS_API_KEY: z
    .string()
    .optional()
    .default(""),
  SHELBY_MODULE_ADDRESS: z.string().default("0x1"),
  PORT: z.coerce.number().int().default(3001),
  CACHE_TTL_SECONDS: z.coerce.number().int().default(30),
  // Cloud infrastructure API for farming nodes
  DO_API_TOKEN: z.string().optional().default(""),
  FARMING_WALLET_ADDRESS: z.string().optional().default(""),
  // Private key for server-managed uploads (Shelby Share feature)
  SHELBY_PRIVATE_KEY: z.string().optional().default(""),
});

export type ApiConfig = z.infer<typeof configSchema>;

export function loadConfig(): ApiConfig {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new Error(
      `Invalid API configuration: ${JSON.stringify(issues, null, 2)}`,
    );
  }
  return result.data;
}
