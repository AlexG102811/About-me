---
name: Browser video persistence
description: Why browser-local video replacements use IndexedDB Blobs and object URLs.
---

Persist replacement videos as Blobs in IndexedDB and preview them through object URLs. Convert legacy data-URL entries to Blobs when loading, and keep localStorage only as a small-file fallback with visible failure messaging.

**Why:** Chromium played the site's MOV files from normal URLs but failed QuickTime data URLs after reload; base64 data URLs also consume localStorage quota quickly.

**How to apply:** Preserve Blob/IndexedDB storage and object-URL playback when changing this upload flow. Infer MIME from the filename when `File.type` is empty or generic; avoid full data URLs except for small compatibility fallback uploads.