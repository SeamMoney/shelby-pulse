/**
 * Shared constants and utilities for farming services
 */

// Faucet configuration
export const FAUCET_URL = 'https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd';
export const DEFAULT_AMOUNT = 1000000000; // 10 ShelbyUSD (8 decimals)
export const REQUESTS_PER_NODE = 50; // Max 50 requests per IP per day

// DigitalOcean regions for geographic diversity (different IP pools)
export const DO_REGIONS = [
  'sfo3',  // San Francisco
  'nyc3',  // New York
  'ams3',  // Amsterdam
  'sgp1',  // Singapore
  'lon1',  // London
  'fra1',  // Frankfurt
  'tor1',  // Toronto
  'blr1',  // Bangalore
];

/**
 * Generate the farming script that runs on each droplet
 * Droplets self-destruct after completing
 */
export function generateFarmingScript(walletAddress: string, doApiToken: string): string {
  return `#!/bin/bash
# ShelbyUSD Farming Bot - Self-destructing after completion
set +e  # Don't exit on errors

WALLET="${walletAddress}"
FAUCET_URL="${FAUCET_URL}"
AMOUNT=${DEFAULT_AMOUNT}
REQUESTS=${REQUESTS_PER_NODE}
DELAY=1
DO_TOKEN="${doApiToken}"

# Get this droplet's ID from metadata
DROPLET_ID=$(curl -s http://169.254.169.254/metadata/v1/id)

echo "Starting ShelbyUSD farming to $WALLET"
echo "Droplet ID: $DROPLET_ID"
echo "Making $REQUESTS requests..."

success=0
failed=0

for i in $(seq 1 $REQUESTS); do
    result=$(curl -s --max-time 10 -X POST "$FAUCET_URL" \\
        -H "Content-Type: application/json" \\
        -H "Origin: https://docs.shelby.xyz" \\
        -d "{\\"address\\":\\"$WALLET\\",\\"amount\\":$AMOUNT}" 2>&1) || true

    if [[ "$result" == *'txn_hashes'* && "$result" != *'"txn_hashes":[]'* ]]; then
        echo "[$i/$REQUESTS] Success!"
        success=$((success + 1))
    elif [[ "$result" == *'"txn_hashes":[]'* ]]; then
        reason=$(echo "$result" | grep -o '"reason":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo "[$i/$REQUESTS] Rate limited: \${reason:-unknown}"
        failed=$((failed + 1))
    else
        echo "[$i/$REQUESTS] Error: \${result:0:100}"
        failed=$((failed + 1))
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
