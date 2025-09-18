# POST /api/voice/transcribe — multipart request

```bash
curl \
  -X POST \
  -H "Authorization: Bearer <jwt-or-api-key>" \
  -H "x-session-id: <sid>" \
  -F "file=@./sample.webm" \
  "http://localhost:3000/api/voice/transcribe"
```

Raw HTTP shape:

```
POST /api/voice/transcribe HTTP/1.1
Host: localhost:3000
Authorization: Bearer <token>
X-Session-Id: 2b6df42f-...
Content-Type: multipart/form-data; boundary=----LunaBoundary

------LunaBoundary
Content-Disposition: form-data; name="file"; filename="sample.webm"
Content-Type: audio/webm

<binary audio data>
------LunaBoundary--
```

- Required field: `file` (25 MB max, enforced by multer).
- Optional query: `?legacy=1` to request the backward-compatible payload.
- Dev mode header: `x-api-key: dev-local` inserted automatically by `apiFetch` (`app/renderer/services/config.ts:83-86`).
