# Android application releases

The platform dashboard uploads compiled APKs as drafts, then explicitly publishes them. No migration or deployment publishes a release.

## Deployment

1. Back up PostgreSQL and apply `npx prisma migrate deploy`; generate Prisma client when building (`npx prisma generate`). The migration `20261023210000_app_releases` adds metadata and a unique published versionCode constraint.
2. Set `MINIO_RELEASES_BUCKET=gympass-releases` (default). Use a new private bucket separate from `MINIO_BUCKET`, which the photo uploader makes public. The backend creates the releases bucket with no anonymous policy and refuses upload when it has any bucket policy statements. Do not add anonymous policies or share it with photos. Existing MINIO_ENDPOINT/PORT/USE_SSL/ACCESS_KEY/SECRET_KEY are reused; credentials require bucket inspection/creation and object read/write/delete. Keep the MinIO management endpoint private.
3. Keep `GYMDASH_SECRET` on the dashboard server and backend; configure `GYMDASH_BILLING_ADMIN_EMAILS` with platform administrators. JWT, the exact server secret, an allowlisted email and role ADMIN are all required. A gym administrator alone cannot upload/publish. Platform release paths bypass that administrator's gym billing block only after these checks.
4. Serve the API over HTTPS. The mobile app resolves relative APK URLs against its trusted API origin. Configure dashboard/API ingress for at least 257 MiB total multipart bodies (APK itself capped at 256 MiB) and suitable upload/download timeouts. Example Nginx: `client_max_body_size 257m;` on the API upload route; also configure the dashboard ingress. Do not buffer entire APKs in application memory.
5. Provide writable OS temporary storage with at least 256 MiB per concurrent upload. Multer streams to random temp files, metadata parsing inflates only AndroidManifest.xml (max4 MiB) and caps expanded string decoding at4 MiB with bounded XML depth/counts, hashing and MinIO transfers stream. Files are removed after validation/storage/database errors and success; Multer removes files when multipart limits fail. An OS crash can leave `gympass-apk-*.tmp`; use an OS temp cleanup policy that does not delete active uploads.
6. Back up the private bucket alongside the database. Published records and APK object paths are immutable through this API; do not replace or remove them manually. Lost objects cannot be repaired by uploading bytes under an old key. No automatic retention deletion is enabled.

## API contract

All JSON responses use `{success:true,data:...,timestamp:...}`. APK responses are raw `application/vnd.android.package-archive` streams with Content-Length, SHA256 ETag and immutable cache headers.

- `GET /api/v1/app-releases/android/latest` → `{release:null|Release}`; published releases only, highest versionCode, `Cache-Control:no-store`.
- `GET /api/v1/app-releases/android/:id/apk` → raw published APK or404. Draft objects never have public storage URLs.
- `GET /api/v1/app-releases/admin?cursor=<id>&limit=20` → `{items,nextCursor}`. Stable newest-created order, maximum20/page.
- `POST /api/v1/app-releases/admin` → multipart field `apk` (max256MiB), field `notes` (max10000 characters). Returns a DRAFT. Extracts package/version from the APK binary manifest using DeviceFarmer adbkit-apkreader, not submitted version fields. Package must be `com.gympass.gympass_sn`, versionCode must be positive (Android limit2100000000), versionName must be a literal nonempty string. Long versionCodeMajor builds and resource-based versionName are rejected. SHA256 is computed server-side.
- `POST /api/v1/app-releases/admin/:id/publish` → published admin Release; idempotent for already published records,404 unknown,409 when versionCode is not strictly higher than all published releases. A PostgreSQL advisory transaction lock serializes publication across backend instances.

Release fields: `id,versionName,versionCode,packageName,notes,sizeBytes,sha256,apkUrl,publishedAt`. Admin records additionally have `status,createdAt`; drafts have null apkUrl/publishedAt. apkUrl is a relative `/api/v1/app-releases/android/:id/apk` URL; no bucket key or credential is returned.

The first installation still requires a trusted signed APK distributed through the existing bootstrap channel. Every update must use the same Android application ID and signing key. The mobile installer independently verifies package, newer versionCode, installed signing identity, size and SHA256, then presents the Android installation confirmation. This backend parses release metadata; it does not verify APK signing certificates against a configured signing identity.

## Verification

`node --test src/app-releases/app-releases.test.cjs` covers visibility, monotonic/idempotent publication, access checks, binary response wrapping and real Nest HTTP JWT guards. It also checks a locally compiled GymPass1.0.11 APK when present. `npm run build` type-checks the Nest/Prisma integration. PostgreSQL integration can use the dedicated local test fixture URL via `APP_RELEASES_TEST_DATABASE_URL`; production databases must never be used for tests.

