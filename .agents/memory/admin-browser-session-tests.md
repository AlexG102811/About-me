---
name: Admin browser session tests
description: Sequencing requirements when simulating session expiry and unauthorized responses in Chromium checks.
---

When testing admin API authorization in Chromium, wait for the inbox's initial list request to render a message before staging a simulated unauthorized response. Otherwise the initial page-load fetch can consume the simulated 401 before the user-triggered action, causing the browser to navigate away before the action runs.

**Why:** Browser checks can race the first inbox fetch during reauthentication, making a later control lookup fail even when the dashboard UI is correct.

**How to apply:** After signing in, wait for the inbox message card to render before intercepting a request triggered by a control.