# ShelbyUSD Faucet Rate Limiting Bypass - Technical Documentation

## Executive Summary

The ShelbyUSD faucet implements a rate limit of **50 requests per IP address per day**. This document describes how farming infrastructure can bypass this limitation through three complementary methods:

1. **Multi-Wallet Local Farming** - Wallet proliferation to bypass per-wallet limits
2. **Cloud Droplet Farming** - Ephemeral cloud infrastructure for IP diversification
3. **CI/CD Runner Farming** - CI/CD runner pools for additional IP diversity

Combined, these methods can theoretically yield **235,000+ ShelbyUSD per hour**.

---

## Table of Contents

- [1. Faucet Rate Limiting Overview](#1-faucet-rate-limiting-overview)
- [2. Bypass Method 1: Multi-Wallet Local Farming](#2-bypass-method-1-multi-wallet-local-farming)
- [3. Bypass Method 2: Cloud Droplet Farming](#3-bypass-method-2-cloud-droplet-farming)
- [4. Bypass Method 3: CI/CD Runner Farming](#4-bypass-method-3-cicd-runner-farming)
- [5. Request Spoofing & Headers](#5-request-spoofing--headers)
- [6. Persistence & Tracking](#6-persistence--tracking)
- [7. Recommended Patches (Aptos/Shelby Perspective)](#7-recommended-patches-aptosshelby-perspective)
- [8. Detection Vectors](#8-detection-vectors)

---

## 1. Faucet Rate Limiting Overview

### Current Limitations

The ShelbyUSD faucet enforces:

| Limit | Value |
|-------|-------|
| Requests per IP per day | 50 |
| Amount per request | 10 ShelbyUSD (1,000,000,000 in smallest units, 8 decimals) |
| Max daily yield per IP | 500 ShelbyUSD |

### Why These Limits Exist

- Prevent testnet token hoarding
- Ensure fair distribution among developers
- Reduce infrastructure costs
- Discourage economic attacks/manipulation

### The Fundamental Weakness

The rate limiting is **IP-based**, not identity-based. This creates two attack vectors:

1. **Wallet Proliferation** - Create unlimited wallets, each receiving tokens
2. **IP Diversification** - Use multiple IPs to multiply the per-IP limit

---

## 2. Bypass Method 1: Multi-Wallet Local Farming

### Location

`scripts/shelbyusd-multi-wallet-farmer.ts`

### How It Works

This method exploits the fact that while the faucet may track per-IP requests, it distributes tokens to any valid wallet address. By generating unlimited wallets, you can:

1. Generate N Aptos wallets using `Account.generate()` from `@aptos-labs/ts-sdk`
2. Store wallet private keys locally in `.shelbyusd-wallets.json`
3. Iterate through wallets, making up to 50 requests per wallet per day
4. Track daily request counts per wallet to avoid hitting limits

### Key Implementation Details

```typescript
// Configuration
const FAUCET_URL = "<faucet-endpoint>";
const DEFAULT_AMOUNT = 1000000000; // 10 ShelbyUSD (8 decimals)
const REQUESTS_PER_DAY = 50;

// Wallet generation
function generateWallet(): WalletInfo {
  const account = Account.generate();
  return {
    address: account.accountAddress.toString(),
    privateKey: account.privateKey.toString(),
    createdAt: new Date().toISOString(),
    totalFarmed: 0,
    todayRequests: 0,
    lastResetDate: new Date().toISOString().split("T")[0],
  };
}

// Daily counter reset (key to sustained farming)
function resetDailyCountsIfNeeded(wallet: WalletInfo): void {
  const today = new Date().toISOString().split("T")[0];
  if (wallet.lastResetDate !== today) {
    wallet.todayRequests = 0;
    wallet.lastResetDate = today;
  }
}
```

### Timing & Delays

- **500ms** between requests to same wallet
- **1000ms** between different wallets
- These delays avoid triggering rate-limit detection

### Yield Calculation

| Metric | Value |
|--------|-------|
| Requests per wallet per day | 50 |
| ShelbyUSD per request | 10 |
| Daily yield per wallet | 500 ShelbyUSD |
| 10 wallets | 5,000 ShelbyUSD/day |
| 100 wallets | 50,000 ShelbyUSD/day |

### Critical Limitation: Untransferable Tokens

**ShelbyUSD has the Untransferable flag**, meaning tokens cannot be moved between wallets. This creates a significant limitation for multi-wallet farming:

| Aspect | Impact |
|--------|--------|
| Token aggregation | **Not possible** - each wallet's tokens are permanently stuck |
| Leaderboard impact | Only the connected wallet's balance is shown |
| Practical value | Limited unless transfers become enabled in the future |

**Example scenario:**
- User generates 100 wallets, each farms 500 ShelbyUSD
- Total farmed: 50,000 ShelbyUSD across all wallets
- User connects Wallet A to the app
- Leaderboard shows: **500 ShelbyUSD** (only Wallet A's balance)
- The other 49,500 ShelbyUSD in Wallets B-Z is invisible and inaccessible

The code acknowledges this limitation:
```typescript
interface WalletsData {
  wallets: WalletInfo[];
  mainWallet?: string; // For future aggregation if transfers become possible
}
```

**Bottom line:** Multi-wallet farming is only useful if:
1. The Untransferable flag gets removed in the future
2. Per-wallet utility matters (voting, staking, access)
3. You're testing/development scenarios

For leaderboard purposes, use Cloud Droplet or CI/CD farming instead (they farm to a single target wallet).

---

## 3. Bypass Method 2: Cloud Droplet Farming

### Location

- `services/pulse-api/src/farming-service.ts` - Main orchestration
- `services/pulse-api/src/farming-scheduler.ts` - Wave deployment
- `services/pulse-api/src/farming-constants.ts` - Configuration & scripts

### Key Difference: Single Target Wallet

Unlike multi-wallet farming, cloud droplet farming sends **all tokens to a single user-specified wallet**. The droplets don't have their own wallets - they simply make HTTP requests to the faucet asking it to fund the target address:

```typescript
export function generateFarmingScript(walletAddress: string, ...) {
  return `...
WALLET="${walletAddress}"
curl ... -d "{\"address\":\"$WALLET\",\"amount\":$AMOUNT}"
```

This means:
- All 15 droplets per wave fund the **same wallet**
- The leaderboard accurately reflects the user's total farmed amount
- No token aggregation issues since everything goes to one place

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Farming Scheduler                             │
│                  (runs every 15 seconds)                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼ Deploy wave every 2 minutes
┌─────────────────────────────────────────────────────────────────┐
│                    Wave Deployment                               │
│         5 regions × 3 droplets = 15 droplets per wave           │
└───┬─────────┬─────────┬─────────┬─────────┬─────────────────────┘
    │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│Region1│ │Region2│ │Region3│ │Region4│ │Region5│
│ (×3)  │ │ (×3)  │ │ (×3)  │ │ (×3)  │ │ (×3)  │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
    │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼
  Each droplet:
  1. Boots Ubuntu
  2. Makes 50 faucet requests
  3. Self-destructs via cloud API
```

### Why Geographic Distribution?

Each cloud region has its own IP pool. By distributing across regions:

- **US West** - West coast US IPs
- **US East** - East coast US IPs
- **Europe** - European IPs
- **Asia** - Asian IPs
- **UK** - UK IPs

The faucet sees requests from completely different geographic locations.

### Configuration

```typescript
// Default continuous farming config - FITS 15 DROPLET LIMIT
const DEFAULT_CONTINUOUS_CONFIG: FarmingJobConfig = {
  regions: ['us-west', 'us-east', 'eu-west', 'asia', 'uk'],
  dropletsPerRegion: 3,
  waveIntervalMs: 2 * 60 * 1000, // 2 minutes between waves
};

// Available regions (can expand for more diversity)
const CLOUD_REGIONS = [
  'us-west',
  'us-east',
  'eu-west',
  'asia-southeast',
  'uk',
  'eu-central',
  'canada',
  'india',
];
```

### The Self-Destructing Farming Script

Each droplet receives a bash script via cloud-init `user_data`:

```bash
#!/bin/bash
set +e  # Don't exit on errors

WALLET="${walletAddress}"
FAUCET_URL="<faucet-endpoint>"
AMOUNT=1000000000
REQUESTS=50
DELAY=1
CLOUD_TOKEN="${cloudApiToken}"

# Get this droplet's ID from cloud metadata service
DROPLET_ID=$(curl -s <cloud-metadata-endpoint>)

echo "Starting ShelbyUSD farming to $WALLET"
echo "Droplet ID: $DROPLET_ID"
echo "Making $REQUESTS requests..."

success=0
failed=0

for i in $(seq 1 $REQUESTS); do
    result=$(curl -s --max-time 10 -X POST "$FAUCET_URL" \
        -H "Content-Type: application/json" \
        -H "Origin: <allowed-origin>" \
        -d "{\"address\":\"$WALLET\",\"amount\":$AMOUNT}" 2>&1) || true

    if [[ "$result" == *'txn_hashes'* && "$result" != *'"txn_hashes":[]'* ]]; then
        echo "[$i/$REQUESTS] Success!"
        success=$((success + 1))
    else
        echo "[$i/$REQUESTS] Failed"
        failed=$((failed + 1))
    fi

    sleep $DELAY
done

echo "=== Farming Complete ==="
echo "Success: $success"
echo "Total SHELBY_USD: $((success * 10))"

# CRITICAL: Self-destruct - delete this droplet
curl -s -X DELETE "<cloud-api>/droplets/$DROPLET_ID" \
    -H "Authorization: Bearer $CLOUD_TOKEN" \
    -H "Content-Type: application/json"

echo "Goodbye!"
```

### Why Self-Destruction Matters

1. **Cost optimization** - Droplets are billed hourly; destroying immediately minimizes cost
2. **IP recycling** - Cloud providers reuse IPs; self-destruction returns IP to pool faster
3. **Trace elimination** - No long-running infrastructure to audit
4. **Rate limit reset** - Next wave gets fresh IPs from the same regions

### Yield Calculation

| Metric | Value |
|--------|-------|
| Droplets per wave | 15 |
| Requests per droplet | 50 |
| ShelbyUSD per request | 10 |
| **ShelbyUSD per wave** | **7,500** |
| Waves per hour (2 min interval) | 30 |
| **Theoretical hourly yield** | **225,000 ShelbyUSD** |

### Timeline Per Wave

```
0:00 - Deploy 15 droplets across 5 regions
0:45 - Droplets boot and start farming script
1:30 - Farming complete (50 requests × 1s delay)
1:31 - Droplets self-destruct
2:00 - Next wave deploys
```

---

## 4. Bypass Method 3: CI/CD Runner Farming

### Location

`services/pulse-api/src/github-farming.ts`

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                 CI/CD Farming Scheduler                          │
│                  (checks every 60 seconds)                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼ Trigger workflow every 15 minutes
┌─────────────────────────────────────────────────────────────────┐
│              CI/CD Workflow                                      │
│           (workflow_dispatch trigger)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌─────────┐     ┌─────────┐       ┌─────────┐
│  Job 1  │     │  Job 2  │  ...  │  Job 5  │
│50 reqs  │     │50 reqs  │       │50 reqs  │
└─────────┘     └─────────┘       └─────────┘
   CI Runner IPs (rotating pool)
```

### How It Works

1. **Trigger via API** - Uses CI platform's workflow dispatch API to trigger workflows
2. **Matrix strategy** - Workflow defines 5 parallel jobs
3. **Each job farms** - Makes 50 faucet requests
4. **IP diversity** - CI runners use a large, rotating IP pool

### Configuration

```typescript
const JOBS_PER_WORKFLOW = 5;
const REQUESTS_PER_JOB = 50;
const ESTIMATED_PER_RUN = JOBS_PER_WORKFLOW * REQUESTS_PER_JOB * 10 * 1e8;

const DEFAULT_CI_CONFIG: FarmingJobConfig = {
  regions: ['ci-runners'],
  dropletsPerRegion: 5, // Represents parallel jobs
  waveIntervalMs: 15 * 60 * 1000, // 15 minutes between workflow triggers
};
```

### Workflow Triggering

```typescript
const response = await fetch(
  `<ci-api>/repos/<owner>/<repo>/actions/workflows/<workflow>/dispatches`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        wallet_address: job.wallet_address,
        num_requests: '50',
      },
    }),
  }
);
```

### Yield Calculation

| Metric | Value |
|--------|-------|
| Jobs per workflow | 5 |
| Requests per job | 50 |
| ShelbyUSD per request | 10 |
| **ShelbyUSD per run** | **2,500** |
| Runs per hour (15 min interval) | 4 |
| **Theoretical hourly yield** | **10,000 ShelbyUSD** |

### Advantages

- **Free compute** - CI platforms have generous free tiers
- **Diverse IPs** - Runner pools span many IPs
- **Parallel execution** - Matrix strategy enables concurrent farming
- **No infrastructure** - No VMs to manage

### Limitations

- **Slower waves** - 15 minute intervals (vs 2 minutes for cloud droplets)
- **Lower parallelism** - 5 jobs vs 15 droplets
- **Rate limits** - CI APIs have their own rate limits
- **Audit trail** - Workflow runs are logged

---

## 5. Request Spoofing & Headers

All farming methods use identical headers to mimic legitimate browser requests:

```typescript
headers: {
  "Content-Type": "application/json",
  Accept: "*/*",
  Origin: "<allowed-origin>",
  Referer: "<allowed-referer>",
}
```

### Why These Headers?

- **Origin/Referer** - The faucet likely checks these to ensure requests come from official documentation
- **Accept** - Standard browser header
- **No User-Agent** - Curl's default is often acceptable; custom UA could be fingerprinted

---

## 6. Persistence & Tracking

### Database Schema

The system uses SQLite to track farming activity:

**`farming_jobs` table:**
```sql
CREATE TABLE farming_jobs (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'active', 'paused', 'stopped', 'completed'
  started_at INTEGER NOT NULL,
  stopped_at INTEGER,
  total_minted INTEGER DEFAULT 0,
  waves_completed INTEGER DEFAULT 0,
  droplets_created INTEGER DEFAULT 0,
  droplets_failed INTEGER DEFAULT 0,
  config TEXT NOT NULL  -- JSON blob
);
```

**`farming_waves` table:**
```sql
CREATE TABLE farming_waves (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  wave_number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  regions TEXT NOT NULL,  -- JSON array
  droplets_succeeded INTEGER DEFAULT 0,
  droplets_failed INTEGER DEFAULT 0,
  estimated_minted INTEGER DEFAULT 0,
  FOREIGN KEY (job_id) REFERENCES farming_jobs(id)
);
```

### Why Track Everything?

1. **Resume after restart** - Jobs persist across service restarts
2. **Yield analysis** - Understand actual vs theoretical yields
3. **Debugging** - Identify which regions/waves fail
4. **Rate optimization** - Tune intervals based on success rates

---

## 7. Recommended Patches (Aptos/Shelby Perspective)

### 7.1 Wallet-Based Protections

| Patch | Description | Effectiveness | Implementation Difficulty |
|-------|-------------|---------------|---------------------------|
| **Wallet age requirement** | Require wallet to exist for N hours/days before first faucet use | Medium | Low |
| **Minimum on-chain activity** | Require wallet to have made real transactions before faucet eligibility | High | Medium |
| **Cumulative balance cap** | Cap total faucet ShelbyUSD per wallet at X amount | Medium | Low |
| **Diminishing returns** | Each subsequent request gives less ShelbyUSD | Medium | Low |
| **Unique wallet per IP** | One wallet can request per IP per day | Medium | Low |

**Analysis:** Wallet age and minimum activity requirements are highly effective because they force attackers to "season" wallets with real transactions, adding significant cost and friction.

### 7.2 IP-Based Protections

| Patch | Description | Effectiveness | Implementation Difficulty |
|-------|-------------|---------------|---------------------------|
| **Cloud IP blacklisting** | Block known cloud provider IP ranges (AWS, GCP, Azure, Vultr, Linode, etc.) | High | Medium |
| **VPN/proxy detection** | Block requests from known VPN/proxy services | Medium | Medium |
| **Residential IP requirement** | Only allow residential IP ranges | High | High |
| **IP reputation scoring** | Use services like MaxMind, IPQualityScore | Medium-High | Medium |
| **Geographic consistency** | Flag wallets receiving from vastly different geos | Medium | Medium |

**Analysis:** Cloud IP blacklisting would immediately break the droplet farming method. Services like MaxMind maintain updated lists of datacenter IPs. However, this may block legitimate developers using cloud-based development environments.

### 7.3 Behavioral Analysis

| Patch | Description | Effectiveness | Implementation Difficulty |
|-------|-------------|---------------|---------------------------|
| **Request pattern analysis** | Detect automated patterns (consistent timing, volume, 50-request batches) | High | Medium |
| **Transaction graph analysis** | Detect coordinated funding to multiple new wallets | Very High | High |
| **Time-of-day analysis** | Flag 24/7 consistent activity from same patterns | Medium | Low |
| **User-agent fingerprinting** | Detect scripted requests vs real browsers | Medium | Low |
| **Request velocity tracking** | Track request frequency anomalies | Medium | Low |

**Analysis:** Transaction graph analysis is the most powerful defense. If all faucet-funded wallets are analyzed and clustered by funding patterns, coordinated farming becomes visible. Tools like Chainalysis or custom graph algorithms can identify suspicious clusters.

### 7.4 Proof-of-Humanity

| Patch | Description | Effectiveness | Implementation Difficulty |
|-------|-------------|---------------|---------------------------|
| **CAPTCHA** | Require CAPTCHA (reCAPTCHA, hCaptcha) for faucet requests | High | Low |
| **Account linking** | Require GitHub/Twitter/Discord account linkage | High | Medium |
| **SMS/phone verification** | Require phone number verification | Very High | Medium |
| **Worldcoin/biometric** | Require biometric proof of humanity | Very High | High |
| **Social verification** | Require social graph verification (Gitcoin Passport, BrightID) | High | Medium |

**Analysis:** CAPTCHA would immediately break all automated farming. However, CAPTCHA farms exist that solve CAPTCHAs for $0.001-0.003 each. Phone verification is more robust as phone numbers have real cost ($1-5+). Biometric solutions like Worldcoin provide the strongest guarantees but have adoption friction.

### 7.5 Economic Deterrents

| Patch | Description | Effectiveness | Implementation Difficulty |
|-------|-------------|---------------|---------------------------|
| **Staking requirement** | Require small APT stake to use faucet | Very High | Medium |
| **Time-locked rewards** | ShelbyUSD locked for N days after receipt | High | Medium |
| **Reputation system** | Build faucet reputation over time for higher limits | Medium-High | High |
| **Gas cost for faucet** | Require gas payment for faucet requests | High | Low |
| **Proof-of-work** | Require computational work for each request | Medium | Medium |

**Analysis:** Staking requirements are highly effective because they add real cost. If using the faucet requires staking 0.1 APT, farming becomes economically irrational unless ShelbyUSD has significant value. Time-locks reduce farming incentives by delaying when tokens become usable.

### 7.6 Recommended Patch Priority

**Immediate (High Impact, Low Effort):**
1. CAPTCHA on all faucet requests
2. Cloud IP blacklisting (known cloud provider ranges)
3. Request pattern detection (flag 50-request batches)

**Short-term (High Impact, Medium Effort):**
4. Wallet age requirement (24-48 hours minimum)
5. Account linking (require GitHub OAuth)
6. IP reputation scoring (MaxMind integration)

**Long-term (Very High Impact, High Effort):**
7. Transaction graph analysis for cluster detection
8. Phone verification
9. Staking requirement

---

## 8. Detection Vectors

### What Could Expose This Farming Operation

1. **Blockchain Forensics**
   - Pattern: Multiple fresh wallets receiving exactly 10 ShelbyUSD × 50 times
   - Timing: Coordinated funding within same time windows
   - Tool: Aptos explorer + custom graph analysis

2. **Cloud Droplet Tags**
   - All farming droplets are tagged with `shelby-farmer`, `continuous`
   - Cloud providers could report suspicious activity
   - Risk: Cloud provider ToS violations

3. **CI/CD Audit Trail**
   - Workflow runs are logged in the CI platform
   - Risk: Public repository = public audit trail

4. **IP Clustering**
   - Pattern: Multiple requests from same cloud/CI IP ranges within short windows
   - Detection: Cross-reference faucet logs with known cloud IP ranges
   - Tool: MaxMind GeoIP database

5. **Request Timing Fingerprint**
   - Pattern: Exactly 1 second between requests (sleep 1)
   - Pattern: Exactly 50 requests per IP per day
   - Detection: Statistical analysis of request intervals

6. **Origin Header**
   - All requests claim legitimate Origin headers
   - But IP addresses don't resolve to expected domains
   - Detection: Correlate Origin header with source IP

---

## Conclusion

This document describes a multi-vector approach to bypassing the ShelbyUSD faucet rate limiting. The combination of wallet proliferation (local farming), IP diversification (cloud droplets), and CI/CD infrastructure enables theoretical yields of 235,000+ ShelbyUSD per hour.

The most effective countermeasures from Shelby's perspective are:
1. **CAPTCHA** - Immediate, high-impact, breaks all automation
2. **Cloud IP blacklisting** - Breaks droplet farming entirely
3. **Transaction graph analysis** - Detects coordinated wallet clusters

For a comprehensive defense, combining multiple layers (proof-of-humanity + IP reputation + behavioral analysis) provides defense-in-depth against farming attacks.
