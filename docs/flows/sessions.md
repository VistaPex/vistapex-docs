# Refresh & revoke sessions

The session credentials you got from `POST /v1/auth/login` last about 1 hour. Three things you might want to do with them: extend them, list all your active sessions, kill one (or all) if compromised.

## What you're doing

Every login mints a separate session, identified by its `api_key_id`. Each session is independent — you can be logged in from your laptop, phone, and a backend service simultaneously, and revoking one doesn't affect the others.

| Endpoint | Auth | Use |
|---|---|---|
| `POST /v1/auth/refresh` | HMAC (your current session) | Extend your current session before it expires. |
| `GET /v1/auth/sessions` | HMAC | List every active session on your account. |
| `DELETE /v1/auth/session` | HMAC | Revoke the session you're calling with (log out). |
| `DELETE /v1/auth/sessions/:api_key_id` | HMAC | Revoke a specific session by id (the laptop you left at the office). |
| `DELETE /v1/auth/sessions` | HMAC | Revoke every active session, including the one you're using. |

::: tip Refresh is one-shot
Refreshing doesn't issue a new `api_key_id` / `api_secret` pair — it pushes the existing pair's `expires_at_ms` forward. The HMAC key you've been using stays the same. **Don't expect a new secret in the response.**
:::

## Prereqs

- A live session — i.e. you've completed [Flow 2](./02-login) and have `api_key_id` + `api_secret` in hand.
- The session hasn't expired yet. Once `expires_at_ms` passes, refresh fails and you have to re-login from scratch.

## 1. Refresh before expiry

```python
# Using the signer from Flow 2:
code, body = signed_request("POST", "/v1/auth/refresh")
print(f"HTTP {code}\n{body}")
```

### Response

```json
{
  "api_key_id": "455cad4ed8b484339d231d86379cccc2a1db3c679d7788229cc1e52c9f2dcc58",
  "expires_at_ms": 1779557698000,
  "trading_account_id": 1779526509
}
```

The `api_key_id` is the same as before. Only `expires_at_ms` advances.

### When to refresh

Refresh proactively when there's ≤ 5 min left on the clock. A simple pattern:

```python
import time

# On boot:
session = login_via_privy(jwt)   # returns { api_key_id, api_secret, expires_at_ms }

# In your hot loop:
while True:
    if session["expires_at_ms"] - int(time.time() * 1000) < 5 * 60 * 1000:
        refresh_resp = signed_request("POST", "/v1/auth/refresh")
        session["expires_at_ms"] = json.loads(refresh_resp[1])["expires_at_ms"]
    do_trading_things()
```

## 2. List your active sessions

Useful for an "active devices" UI, or for a security audit.

```python
code, body = signed_request("GET", "/v1/auth/sessions")
```

### Response

```json
{
  "sessions": [
    {
      "api_key_id": "455cad4...c9f2dcc58",
      "created_at_ms": 1779553698000,
      "expires_at_ms": 1779557698000,
      "name": null,
      "kind": "session"
    },
    {
      "api_key_id": "a1b2c3d4...e5f6",
      "created_at_ms": 1779540000000,
      "expires_at_ms": 1779543600000,
      "name": null,
      "kind": "session"
    }
  ]
}
```

`api_secret` is never returned — only the public id. You can't recover a leaked secret from here; you can only revoke the leaked key.

## 3. Revoke the current session (log out)

```python
code, body = signed_request("DELETE", "/v1/auth/session")
```

After this, any subsequent call with the same `api_key_id` returns `401 invalid credentials`. The `api_secret` is dead — you'd need to re-login to get a fresh pair.

## 4. Revoke a specific session by id

You're on your phone, you see an old session from your laptop you forgot to log out of. Pick the `api_key_id` from the list call (step 2) and revoke it:

```python
LAPTOP_KEY_ID = "a1b2c3d4...e5f6"
code, body = signed_request("DELETE", f"/v1/auth/sessions/{LAPTOP_KEY_ID}")
```

You stay logged in on your phone; the laptop session is dead.

## 5. Revoke every session (panic button)

If you think your account's compromised — credentials leaked, suspicious activity, anything weird — kill everything in one call:

```python
code, body = signed_request("DELETE", "/v1/auth/sessions")
```

This revokes **every** active session including the one you used to make the call. The next API call fails with `401`. Re-login via Privy to get a fresh session.

::: warning Panic-button is not reversible
Revoking is one-way. You can't un-revoke a session. Plan to re-login immediately after panic-button.
:::

## Common errors

| Status | Body | Meaning | Fix |
|---|---|---|---|
| `401 invalid credentials` | `{"code":1010,...}` | Session expired, was revoked, or signature is wrong | Re-login via Privy. |
| `404 session not found` | `{"code":1012,...}` | The `api_key_id` you tried to revoke doesn't exist or isn't yours | Verify the id from `GET /v1/auth/sessions`. |
| `429 too many auth ops` | `{"code":1006,...}` | Lots of refresh/revoke calls in a short window | Back off — refresh once every ~5 min is plenty. |

## Where to next

- → [Long-lived API keys](./api-keys) — for backend services / bots that need keys that outlast a session.
- → [Auth & request signing](../reference/auth-signing) — the HMAC scheme reference.
