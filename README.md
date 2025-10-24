# Files Manager

Fast, minimal file management API built with Node.js, Express, MongoDB, and Redis. It supports user registration and token-based authentication, file/folder/image uploads, publish/unpublish, listing, and content delivery with optional thumbnail sizes for images.

> [!NOTE]
> This project is intentionally lightweight. It exposes a simple REST API without external storage; files are written to the local filesystem.

## Features

- Health and stats endpoints to check service and DB status
- User registration, login (Basic → token), and profile endpoint
- Upload folder, file, or image (base64 payload)
- List files with pagination and parent traversal
- Publish/unpublish files
- Fetch file binary content (with MIME type)

## Architecture

- Runtime: Node.js + Express
- Data store: MongoDB (users, files)
- Cache/session: Redis (auth tokens)
- Background jobs: Bull queue (for image processing/variants) [optional; worker may be added]
- Storage: Local filesystem (configurable path)

Directory highlights:

- `server.js` – Express app bootstrap and routing
- `routes/index.js` – Route definitions
- `controllers/*` – Request handlers (Auth, Users, Files, App)
- `utils/db.js` – MongoDB client wrapper
- `utils/redis.js` – Redis client wrapper
- `utils/users.js` – Helpers for user lookup by token

## Quick start

Prerequisites:

- Node.js 14+ (12 may work but is not recommended)
- MongoDB 4.x+
- Redis 5.x+

1. Install dependencies

```bash
npm install
```

2. Configure environment

Create a `.env` file (or export env vars in your shell) based on `.env.example`.

3. Start the API server

```bash
# Starts Express on the configured PORT (default: 5000)
npm run start-server
```

Optionally, for development with auto-reload:

```bash
npm run dev
```

> [!TIP]
> MongoDB and Redis must be running locally (or reachable over the network) before starting the server.

## Configuration

Supported environment variables:

- `PORT` – HTTP port (default: `5000`)
- `DB_HOST` – MongoDB host (default: `localhost`)
- `DB_PORT` – MongoDB port (default: `27017`)
- `DB_DATABASE` – MongoDB database name (default: `files_manager`)
- `FOLDER_PATH` – Local directory to store uploaded files (default: `/tmp/files_manager`)

> [!NOTE]
> Redis uses the node-redis defaults (localhost:6379) in this project. If you need custom Redis host/port, extend `utils/redis.js` accordingly.

## Authentication overview

1. Register a user: `POST /users` with JSON `{ "email", "password" }`
2. Login to get a token: `GET /connect` with an `Authorization: Basic base64(email:password)` header
3. Use the token in subsequent requests via `X-Token: <token>` header
4. Logout: `GET /disconnect` with `X-Token`

> [!IMPORTANT]
> Passwords are stored as sha1 hashes for the purposes of this exercise. For production use, switch to a strong password hashing algorithm (e.g., bcrypt/argon2) and TLS everywhere.

## API

Common endpoints:

- `GET /status` – Service dependencies status (MongoDB, Redis)
- `GET /stats` – Aggregated counts (users, files)
- `POST /users` – Create user account
- `GET /connect` – Exchange Basic credentials for a token
- `GET /disconnect` – Invalidate token
- `GET /users/me` – Current user profile (requires `X-Token`)
- `POST /files` – Upload folder/file/image
- `GET /files` – List files (supports `parentId`, `page`)
- `GET /files/:id` – File metadata
- `PUT /files/:id/publish` – Make file public
- `PUT /files/:id/unpublish` – Make file private
- `GET /files/:id/data` – Raw file content (requires owner or public)

Detailed request/response schemas and examples live in `docs/api.md`.

## Examples

Register a user:

```bash
curl -X POST http://localhost:5000/users \
	-H "Content-Type: application/json" \
	-d '{"email":"user@example.com","password":"secret"}'
```

Login (Basic) to get a token:

```bash
curl -i http://localhost:5000/connect \
	-H "Authorization: Basic $(printf 'user@example.com:secret' | base64)"
```

Upload a file (base64-encoded content):

```bash
BASE64_CONTENT=$(printf 'hello world' | base64 -w 0)
curl -X POST http://localhost:5000/files \
	-H "Content-Type: application/json" \
	-H "X-Token: <YOUR_TOKEN>" \
	-d '{
		"name":"hello.txt",
		"type":"file",
		"isPublic":false,
		"data":"'"${BASE64_CONTENT}"'"
	}'
```

> [!CAUTION]
> For non-folder uploads, send file content as base64 in the `data` field. Do not send raw binary in JSON.

## Development

- Lint: `npm run lint`
- Tests: `npm test`
- Redis quick check: run `node main_redis_test.js`
- DB quick check: run `node main_db_test.js`

> [!NOTE]
> Some scripts require a local MongoDB and Redis instance. If you use Docker, map default ports 27017 and 6379 to localhost.

## Troubleshooting

- Ensure the process has write access to `FOLDER_PATH` (default: `/tmp/files_manager`).
- If you receive `Unauthorized`, verify your `X-Token` or Basic credentials and that Redis is running.
- For `Not found` on `GET /files/:id/data`, confirm the file is public or you’re the owner.

## Resources

- See `resources.md` for additional pointers and references.
