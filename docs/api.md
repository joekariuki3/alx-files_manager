## API Reference

This document details the REST API exposed by Files Manager.

Base URL: `http://localhost:5000`

Auth headers:

- Login: `Authorization: Basic base64(email:password)`
- Authenticated requests: `X-Token: <token>`

---

### Health and stats

GET /status

- 200 OK: `{ "redis": true, "db": true }`

GET /stats

- 200 OK: `{ "users": 1, "files": 3 }`

---

### Users

POST /users

Create a new user.

Request body:

```json
{ "email": "user@example.com", "password": "secret" }
```

Responses:

- 201 Created: `{ "id": "<mongoId>", "email": "user@example.com" }`
- 400 Bad Request: `{ "error": "Missing email" | "Missing password" | "Already exist" }`

GET /connect

Exchange Basic credentials for a token.

Headers:

```
Authorization: Basic base64(email:password)
```

Responses:

- 200 OK: `{ "token": "<uuid>" }`
- 401 Unauthorized

GET /disconnect

Invalidate the current token.

Headers:

```
X-Token: <token>
```

Responses:

- 204 No Content
- 401 Unauthorized

GET /users/me

Get current user profile.

Headers: `X-Token: <token>`

- 200 OK: `{ "id": "<mongoId>", "email": "user@example.com" }`
- 401 Unauthorized

---

### Files

POST /files

Create a folder, file, or image.

Headers: `X-Token: <token>`

Request body fields:

- `name` (string, required)
- `type` (string, required) – one of `folder`, `file`, `image`
- `isPublic` (boolean, optional, default: false)
- `parentId` (string|number, optional, default: 0)
- `data` (base64 string, required when type != folder)

Responses:

- 201 Created: `{ id, userId, name, type, isPublic, parentId }`
- 400 Bad Request: `Missing name` | `Missing type` | `Missing data` | `Parent not found` | `Parent is not a folder`
- 401 Unauthorized

GET /files

List files for the authenticated user.

Headers: `X-Token: <token>`

Query params:

- `parentId` (string|number, optional)
- `page` (number, optional, default: 0) – page size is 20

200 OK: `[{ id, userId, name, type, isPublic, parentId }, ...]`

GET /files/:id

Get file metadata for the authenticated user.

Headers: `X-Token: <token>`

Responses:

- 200 OK: `{ id, userId, name, type, isPublic, parentId }`
- 401 Unauthorized | 404 Not found

PUT /files/:id/publish

Publish a file (make it publicly accessible).

Headers: `X-Token: <token>`

200 OK: `{ id, userId, name, type, isPublic, parentId }`

PUT /files/:id/unpublish

Unpublish a file.

Headers: `X-Token: <token>`

200 OK: `{ id, userId, name, type, isPublic, parentId }`

GET /files/:id/data

Fetch raw file content. Public files are accessible without a token; private files require ownership.

Query:

- `size` (number, optional) – if image variants exist, returns the corresponding size (implementation-dependent)

Responses:

- 200 OK: binary content with `Content-Type` set based on filename
- 400 Bad Request: `A folder doesn't have content`
- 404 Not found

> Implementation notes
>
> - Files are stored on the local filesystem under `FOLDER_PATH` and referenced by a generated UUID path.
> - Image thumbnails/variants may require a background worker when implemented.
