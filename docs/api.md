# API

The bot process includes a small HTTP server to support internal data endpoints and health checks.

By default it binds to `127.0.0.1:3000` (not publicly exposed in the EC2 Docker deployment).

## Configuration

Environment variables:

- `HTTP_BIND` (default `127.0.0.1`)
- `HTTP_PORT` (default `3000`)
- `DISABLE_HTTP_API=true` to disable the server entirely

## Endpoints

### Health

- `GET /healthz`
  - Returns: `{ "ok": true }`

### Random WEB Verse (Scoped)

All random verse endpoints use bible-api.com with the `WEB` (World English Bible) translation.

- `GET /data/web/random/OT`
- `GET /data/web/random/NT`
- `GET /data/web/random/{BOOK}`
  - Example: `/data/web/random/JHN`

`BOOK` must match a canonical WEB `book_id` (e.g., `GEN`, `PSA`, `MAT`, `JHN`, `1CO`, `1JN`, `SNG`).
Common aliases are accepted and normalized.

Response fields:

- `translation`: `{ id, name, note }`
- `reference`
- `bookId`, `bookName`
- `chapter`, `verse`
- `text`
- `url` (the bible-api.com URL used)
- `source` attribution

Debug/testing:

- Optional query string `?offset=<number>` forces a deterministic selection within the scope (used in tests).

