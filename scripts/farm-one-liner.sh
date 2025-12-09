#!/bin/bash
# One-liner farming script - copy and run on any server
# Usage: curl -sL <url> | WALLET=0x... bash

WALLET="${WALLET:-0x234d7b83de4997067afee6e0ae2f47a28636419c0e3fbe9dddcd8ca4c230f9dc}"
for i in {1..50}; do
  r=$(curl -s -X POST "https://faucet.shelbynet.shelby.xyz/fund?asset=shelbyusd" \
    -H "Content-Type: application/json" -H "Origin: https://docs.shelby.xyz" \
    -d "{\"address\":\"$WALLET\",\"amount\":1000000000}")
  echo "[$i/50] $(echo $r | grep -o '"txn_hashes":\[[^]]*\]' | head -c50)..."
  sleep 1
done
echo "Done! Farmed up to 500 SHELBY_USD to $WALLET"
