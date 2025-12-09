#!/bin/bash

# ShelbyUSD Faucet Farming - Cloud Deployment Script
# Spins up multiple Digital Ocean droplets, each farming to your wallet

# Configuration
WALLET_ADDRESS="${WALLET_ADDRESS:-0x234d7b83de4997067afee6e0ae2f47a28636419c0e3fbe9dddcd8ca4c230f9dc}"
NUM_DROPLETS="${NUM_DROPLETS:-5}"
DROPLET_SIZE="s-1vcpu-512mb-10gb"  # $4/month, cheapest
DROPLET_REGION="sfo3"
DROPLET_IMAGE="ubuntu-24-04-x64"
DROPLET_NAME_PREFIX="shelby-farmer"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       ShelbyUSD Cloud Farming Deployment                   ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Wallet:    ${WALLET_ADDRESS:0:12}...${WALLET_ADDRESS: -8}              ║"
echo "║  Droplets:  $NUM_DROPLETS                                              ║"
echo "║  Size:      $DROPLET_SIZE                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check for doctl
if ! command -v doctl &> /dev/null; then
    echo "❌ doctl not found. Install with: brew install doctl"
    echo "   Then authenticate: doctl auth init"
    exit 1
fi

# The farming script that runs on each droplet
FARM_SCRIPT='#!/bin/bash
WALLET="'"$WALLET_ADDRESS"'"
FAUCET_URL="https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd"
AMOUNT=1000000000
REQUESTS=50
DELAY=2

echo "Starting ShelbyUSD farming to $WALLET"
echo "Making $REQUESTS requests..."

success=0
failed=0

for i in $(seq 1 $REQUESTS); do
    result=$(curl -s -X POST "$FAUCET_URL" \
        -H "Content-Type: application/json" \
        -H "Origin: https://docs.shelby.xyz" \
        -d "{\"address\":\"$WALLET\",\"amount\":$AMOUNT}")

    if echo "$result" | grep -q "txn_hashes"; then
        if echo "$result" | grep -q '"txn_hashes":\[\]'; then
            echo "[$i/$REQUESTS] Failed: $(echo $result | jq -r .rejection_reasons[0].reason 2>/dev/null || echo $result)"
            ((failed++))
        else
            txn=$(echo $result | jq -r .txn_hashes[0] 2>/dev/null)
            echo "[$i/$REQUESTS] Success: ${txn:0:16}..."
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
'

echo "Creating $NUM_DROPLETS droplets..."
echo ""

for i in $(seq 1 $NUM_DROPLETS); do
    name="${DROPLET_NAME_PREFIX}-${i}"
    echo "Creating droplet: $name"

    # Create droplet with user-data script
    doctl compute droplet create "$name" \
        --size "$DROPLET_SIZE" \
        --image "$DROPLET_IMAGE" \
        --region "$DROPLET_REGION" \
        --user-data "$FARM_SCRIPT" \
        --wait \
        --no-header \
        --format ID,Name,PublicIPv4,Status &
done

wait
echo ""
echo "✅ All droplets created!"
echo ""
echo "To check status:"
echo "  doctl compute droplet list --format ID,Name,PublicIPv4,Status | grep shelby-farmer"
echo ""
echo "To view logs (SSH into droplet):"
echo "  doctl compute ssh <droplet-name>"
echo "  cat /var/log/cloud-init-output.log"
echo ""
echo "To delete all farming droplets:"
echo "  doctl compute droplet list --format ID,Name | grep shelby-farmer | awk '{print \$1}' | xargs -I {} doctl compute droplet delete {} -f"
