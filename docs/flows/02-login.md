# 2. Log in

Exchange your Privy JWT for a per-session API key + secret. The exchange is one-shot; the key lasts ~1 hour and can be revoked at any time.

## What you're doing

Privy handles the wallet + identity layer. You sign in via Privy's embedded-wallet flow (usually in the frontend), which gives you a JWT. You then `POST /v1/auth/login` with that JWT in the `Authorization: Bearer …` header, and the gateway returns:

- `api_key_id` — public key id, sent on every signed request.
- `api_secret` — the HMAC secret to sign requests with. **Hex-decode it once and reuse the 32 raw bytes.**
- `trading_account_id` — your numeric account id.
- `expires_at_ms` — when this session expires.

After this, you never touch the JWT again. Every subsequent call is signed with the api_secret (HMAC-SHA256 over `timestamp || method || target || sha256(body)`).

::: tip Why this two-step shape
Privy's JWT is good identity, but every API call signing it would mean leaking it to every CDN edge. Exchanging it once for a short-lived HMAC key keeps the JWT in client memory.
:::

## Prereqs

- A Privy account on the VistaPex frontend (`https://testnet.vistapex.io/login` or your local dev URL).
- A valid JWT in hand. From the browser: open DevTools → Application → IndexedDB → `privy:cmpghglar00is0cjxth9udi4n` → `session-tokens` → copy the `accessToken`.

## Step 1 — exchange the JWT for session credentials

```bash
GATEWAY=https://gateway.testnet.vistapex.io
JWT="eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6..."  # your Privy access token

curl -sS -X POST "$GATEWAY/v1/auth/login" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## What success looks like

```json
{
  "user_id": 1779526509,
  "trading_account_id": 1779526509,
  "api_key_id": "455cad4ed8b484339d231d86379cccc2a1db3c679d7788229cc1e52c9f2dcc58",
  "api_secret": "71e3eac183eff82d4eedd303358014530c7cda182bec2ee3f7b9c2fc8bd3cf86",
  "expires_at_ms": 1779557698000
}
```

| Field | Use it for |
|---|---|
| `trading_account_id` | Every signed call that targets your account (most query params, all writes). |
| `api_key_id` | The `x-api-key` header on every signed request. |
| `api_secret` | The HMAC key — hex-decode once, sign every request. |
| `expires_at_ms` | When to re-login. Re-login before this; expired keys reject with 401. |

::: warning Store carefully
The `api_secret` is the keys-to-your-account credential — anyone with it can place orders and (if you have withdrawal permission) request withdrawals. Treat it like a password.
:::

## Step 2 — sign your first authenticated request

Every authenticated call needs three headers:

| Header | Value |
|---|---|
| `x-api-key` | The `api_key_id` from step 1 |
| `x-timestamp` | Current unix milliseconds (e.g. `1779600000000`) |
| `x-signature` | hex(HMAC-SHA256(hex_decode(api_secret), payload)) |

`payload = "${timestamp_ms}${METHOD}${request_target}${hex(sha256(body))}"`

Empty body → `sha256("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

A Python signer for quick local testing:

```python
import hashlib, hmac, json, time, urllib.request, urllib.error

API_KEY = "455cad4ed8b484339d231d86379cccc2a1db3c679d7788229cc1e52c9f2dcc58"
API_SECRET_HEX = "71e3eac183eff82d4eedd303358014530c7cda182bec2ee3f7b9c2fc8bd3cf86"
GATEWAY = "https://gateway.testnet.vistapex.io"

def signed_request(method, path, body=None):
    body_bytes = json.dumps(body).encode() if body is not None else b""
    ts = str(int(time.time() * 1000))
    payload = f"{ts}{method}{path}{hashlib.sha256(body_bytes).hexdigest()}".encode()
    sig = hmac.new(bytes.fromhex(API_SECRET_HEX), payload, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        f"{GATEWAY}{path}",
        method=method,
        data=body_bytes if body is not None else None,
        headers={
            "x-api-key": API_KEY,
            "x-timestamp": ts,
            "x-signature": sig,
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Smoke test:
code, body = signed_request("GET", "/v1/account?trading_account_id=1779526509")
print(f"HTTP {code}\n{body}")
```

For TypeScript / Rust / Go signers, see the [auth-signing reference](../reference/auth-signing).

## Common errors

| Status | Body | Meaning |
|---|---|---|
| `401 invalid credentials` | `{"code":1010,...}` | Signature wrong, key revoked, timestamp skew > 60 s, or expired key |
| `401 missing privy token` | `{"code":1010,...}` | No `Authorization: Bearer …` header on `/v1/auth/login` |
| `503 privy auth temporarily unavailable` | `{"code":1015,...}` | Privy JWKS unreachable — retry with backoff |
| `429 login rate limit exceeded` | `{"code":1006,...}` | Too many login attempts from this IP — wait ~1 min |

## Next

→ [Deposit USDC](./03-deposit)
