# Auth & request signing

Every authenticated REST + WS call uses an HMAC-SHA256 signature over a canonical payload string. This page is the protocol reference; the [login flow](../flows/02-login) walks you through getting the key in the first place.

## The wire shape

Every signed request carries three headers:

| Header | Value |
|---|---|
| `x-api-key` | Your `api_key_id` (hex string) returned from `POST /v1/auth/login`. |
| `x-timestamp` | Current unix time in **milliseconds**, as a decimal string. |
| `x-signature` | `hex(HMAC-SHA256(hex_decode(api_secret), payload))` — see below. |

The server rejects with `401 invalid credentials` if:

- `x-api-key` doesn't match any known active key.
- `x-timestamp` is more than ±60 seconds skewed from server time (replay protection).
- `x-signature` doesn't match a re-computation of the same payload.

## The canonical payload

```
payload = ${timestamp_ms} ${METHOD} ${request_target} ${body_hash_hex}
```

(concatenation; **no spaces or delimiters** between fields)

| Component | Example |
|---|---|
| `timestamp_ms` | `"1779600000000"` — exact same value as the `x-timestamp` header |
| `METHOD` | `"GET"`, `"POST"`, `"DELETE"` etc. — uppercase, no trailing space |
| `request_target` | The path + query string: `"/v1/account?trading_account_id=1779526509"` |
| `body_hash_hex` | `sha256(body_bytes).hex_lower()` — for empty body use `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Then:

```
api_secret_bytes = hex_decode(api_secret_hex)
signature_bytes = hmac_sha256(api_secret_bytes, payload.encode("utf-8"))
x_signature_header = signature_bytes.hex_lower()
```

## Reference implementations

### Python (stdlib only)

```python
import hashlib, hmac, json, time, urllib.request, urllib.error

GATEWAY = "https://gateway.testnet.vistapex.io"
API_KEY = "455cad4ed8b484339d231d86379cccc2a1db3c679d7788229cc1e52c9f2dcc58"
API_SECRET_HEX = "71e3eac183eff82d4eedd303358014530c7cda182bec2ee3f7b9c2fc8bd3cf86"

def signed_request(method, path, body=None):
    body_bytes = json.dumps(body).encode() if body is not None else b""
    ts = str(int(time.time() * 1000))
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    payload = f"{ts}{method}{path}{body_hash}".encode("utf-8")
    sig = hmac.new(bytes.fromhex(API_SECRET_HEX), payload, hashlib.sha256).hexdigest()

    headers = {
        "x-api-key": API_KEY,
        "x-timestamp": ts,
        "x-signature": sig,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(
        f"{GATEWAY}{path}",
        method=method,
        data=body_bytes if body is not None else None,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
```

### TypeScript

```typescript
import { createHash, createHmac } from "node:crypto";

const GATEWAY = "https://gateway.testnet.vistapex.io";
const API_KEY = "455cad4ed8b484339d231d86379cccc2a1db3c679d7788229cc1e52c9f2dcc58";
const API_SECRET_HEX = "71e3eac183eff82d4eedd303358014530c7cda182bec2ee3f7b9c2fc8bd3cf86";

async function signedRequest(
  method: "GET" | "POST" | "DELETE" | "PATCH" | "PUT",
  path: string,
  body?: object
): Promise<{ status: number; body: string }> {
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  const ts = Date.now().toString();
  const bodyHash = createHash("sha256").update(bodyStr).digest("hex");
  const payload = `${ts}${method}${path}${bodyHash}`;
  const secretBytes = Buffer.from(API_SECRET_HEX, "hex");
  const sig = createHmac("sha256", secretBytes).update(payload).digest("hex");

  const headers: Record<string, string> = {
    "x-api-key": API_KEY,
    "x-timestamp": ts,
    "x-signature": sig,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${GATEWAY}${path}`, {
    method,
    headers,
    body: body !== undefined ? bodyStr : undefined,
  });
  return { status: res.status, body: await res.text() };
}
```

### Rust (with `reqwest` + `hmac`)

```rust
use hex;
use hmac::{Hmac, Mac};
use reqwest::Method;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const GATEWAY: &str = "https://gateway.testnet.vistapex.io";
const API_KEY: &str = "455cad4...";
const API_SECRET_HEX: &str = "71e3eac...";

async fn signed_request(
    method: Method,
    path: &str,
    body: Option<&serde_json::Value>,
) -> Result<(u16, String), Box<dyn std::error::Error>> {
    let body_str = body.map(|v| serde_json::to_string(v).unwrap()).unwrap_or_default();
    let body_bytes = body_str.as_bytes();

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis()
        .to_string();
    let body_hash = hex::encode(Sha256::digest(body_bytes));
    let payload = format!("{}{}{}{}", ts, method.as_str(), path, body_hash);

    let secret = hex::decode(API_SECRET_HEX)?;
    let mut mac = HmacSha256::new_from_slice(&secret)?;
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());

    let client = reqwest::Client::new();
    let mut req = client.request(method, format!("{}{}", GATEWAY, path))
        .header("x-api-key", API_KEY)
        .header("x-timestamp", &ts)
        .header("x-signature", &sig);
    if !body_str.is_empty() {
        req = req.header("Content-Type", "application/json").body(body_str);
    }
    let resp = req.send().await?;
    Ok((resp.status().as_u16(), resp.text().await?))
}
```

## Common signing mistakes

| Symptom | Likely cause |
|---|---|
| Every request returns 401 | API secret used as-is instead of hex-decoded first. The secret is hex; decode it once and reuse the raw 32 bytes. |
| First request works, second fails | Reusing the same `x-timestamp` across requests. Each request needs a fresh timestamp. |
| Works locally, fails in production | Clock drift > 60 s. Sync your system clock (NTP). |
| `GET` with query params fails but `POST` works | Including query params in `request_target` is mandatory — `"/v1/account?trading_account_id=1779526509"`, not `"/v1/account"`. |
| Empty-body POST fails | `body_hash` for empty body must be `sha256("")` = `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, NOT empty string. |

## Permissions

The api_key minted by `POST /v1/auth/login` carries a permission set:

| Permission | Allows |
|---|---|
| `read` | `GET /v1/*` (account, history, balances) |
| `manage_orders` | `POST /v1/orders`, `DELETE /v1/orders/{id}`, `POST /v1/orders/cancel-and-place` |
| `withdraw` | `POST /v1/withdrawals` |

Login-flow keys (the one you get from `POST /v1/auth/login`) have **all three** by default. Long-lived programmatic keys (issued via `POST /v1/api_keys`) can be restricted — e.g. a read-only key for analytics, or a trading-only key without withdraw permission.

## Re-login schedule

`api_secret` is short-lived (~1 hour). Re-login **before** `expires_at_ms`. After expiry the key is permanently invalid — even reactivation via revoke-and-mint won't restore the old secret.
