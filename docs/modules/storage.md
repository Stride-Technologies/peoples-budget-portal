# Module: `storage`

**Folder:** `api/src/storage/`

## Purpose

Stores and serves arbitrary files. The first (and currently only) consumer
is [`ppmp`](ppmp.md)'s "Attached Supporting Documents" line-item upload
(`POST /ppmp/:id/line-items/:lineItemId/document`). Built as a `mail`-shaped
adapter module — same `resolveXProvider()` + `Symbol` DI token + factory
provider — so a second consumer can reuse it without a new pattern.

## Adapter selection

`StorageModule` picks its adapter from `STORAGE_PROVIDER` when set:

| `STORAGE_PROVIDER` | Adapter | Configuration |
|---|---|---|
| `local` | `LocalFileStorageAdapter` | Writes under gitignored `api/uploads/ppmp/`; served back by this module's own streaming route |
| `do-spaces` | `DOSpacesStorageAdapter` | `@aws-sdk/client-s3` `PutObjectCommand` against `DO_SPACES_ENDPOINT`/`DO_SPACES_BUCKET`/`DO_SPACES_REGION`/`DO_SPACES_KEY`/`DO_SPACES_SECRET` |

If `STORAGE_PROVIDER` is unset, staging/production default to `do-spaces`;
all other environments default to `local`. DO Spaces is S3-compatible, and so is
anything else that speaks S3: see [deployment.md](../deployment.md).

`DO_SPACES_BUCKET` must be the Space's name. `DO_SPACES_ENDPOINT` may be either
the Space's own origin (`https://<bucket>.sgp1.digitaloceanspaces.com`, what
the DO console shows) or the regional one; `spacesEndpoints()` strips the
bucket label before handing the endpoint to the SDK, because the SDK adds the
bucket to the hostname itself. A mocked-client test cannot catch a wrong
endpoint: check a new bucket with one real upload.

## Local dev file serving

`StorageController` (`GET /ppmp/uploads/:filename`, `@Public()`) streams
back files the local adapter wrote. It rejects any filename containing `/`,
`\`, or `..` — stored filenames are always `randomUUID()` + the original
extension, so a request containing a path separator can only be an attempt
at traversal, not a real stored file. It answers 404 for every request
unless `resolveStorageProvider` picks `local` — with DO Spaces the document
URLs point at the bucket, so the API's disk is never served (#127). Files go
out with a `Content-Type` taken from the extension (which the upload already
checked against the file's bytes) and `X-Content-Type-Options: nosniff`.

## Service

- **`StorageService.save(file)`** — thin wrapper injecting the
  `STORAGE_ADAPTER` token; returns `{ url, key }`. Callers pass
  `{ buffer, mimetype, originalname }` (matches `Express.Multer.File`'s
  shape after `FileInterceptor` buffers the upload).

## Consumers

- [`ppmp`](ppmp.md) — `PpmpService.attachDocument` calls `StorageService.save`
  and snapshots the returned `url`/`key`-derived name onto the line item.

## Dependencies

`ConfigService` (adapter selection and provider settings).

## Related

- [ppmp.md](ppmp.md) — the only consumer today
- [mail.md](mail.md) — the adapter pattern this module mirrors exactly
- deployment-do.md — DO Spaces provisioning
- `specs/003-ppmp-procurement-fields/research.md` — the "why" behind mirroring `mail` instead of a new pattern
