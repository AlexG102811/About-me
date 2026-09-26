---
name: App Storage default bucket
description: Replit App Storage's Python client requires a bucket attached to the repl.
---

The Replit App Storage Python SDK's default `Client()` requires an attached default bucket. Without one, storage requests fail with a default-bucket configuration error. Bucket provisioning happens through Replit infrastructure, not by writing a local config file.

**Why:** Local-file fallback would make public contact submissions appear successful while they are not stored in the persistent inbox.

**How to apply:** Before testing or publishing features that use App Storage, confirm a bucket is attached. Keep the app fail-closed with a clear setup message when storage is unavailable; do not silently switch contact data to local files.