# Exercise catalog maintenance

The backend ships metadata and notices. Animation GIFs and PNG posters are stored
in the existing MinIO bucket, under `exercises/gif750-v1/flow/<source revision>/`.
The catalog is not imported into the database automatically.

From the backend directory:

```powershell
python -m pip install -r scripts/exercise_catalog_requirements.txt
python scripts/exercise_catalog_build.py

# Supply the existing MinIO settings through this process's environment.
$settings = @{}
'MINIO_ENDPOINT','MINIO_PORT','MINIO_USE_SSL','MINIO_ACCESS_KEY','MINIO_SECRET_KEY','MINIO_BUCKET' |
  ForEach-Object { $settings[$_] = [Environment]::GetEnvironmentVariable($_) }
$settings | ConvertTo-Json -Compress |
  node scripts/exercise_catalog_publish.cjs ../.tmp/exercise-catalog-build/rendered assets/exercise-catalog
```

The builder downloads pinned public source revisions and verifies every upstream
SVG hash before rasterization. No upstream scripts or Gym Visual media are used.
Build dependencies are unnecessary in production. Temporary downloads and binary
output stay outside the backend repository and image.

The publisher never changes bucket policies. Use an existing bucket with public
read access to this prefix, HTTPS and valid MinIO credentials. It verifies local
hashes, remote object size/hash metadata and representative anonymous HTTPS
downloads before writing `catalog.json` with the media index. Commit only the
metadata/notices/checksums after this command succeeds.

Four original positions (0,1,2,1) play at 750ms each, three seconds per cycle.
This is illustrative timing, not exercise tempo guidance. Change the render
version prefix when changing rendering parameters; immutable objects must not be
replaced under an already published URL.

The admin imports drafts or links a source to an existing exercise ID. Linking or
editing resets publication. Activation requires an available animation, explicit
review and the `updatedAt` version actually reviewed. Review includes the French
instructions, movement, equipment and variant. The dataset is experimental;
retain the included upstream license and provenance notices.
