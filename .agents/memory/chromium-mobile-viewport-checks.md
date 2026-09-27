---
name: Chromium mobile viewport checks
description: Correctly measuring CSS viewport width and horizontal overflow in DevTools mobile emulation.
---

When Chromium is controlled through DevTools with `Emulation.setDeviceMetricsOverride` and `mobile: true`, use `document.documentElement.clientWidth` as the CSS layout viewport boundary. `window.innerWidth` can report a wider visual viewport than the requested device width. Compare `document.documentElement.scrollWidth` to `clientWidth` to detect horizontal page overflow, then inspect element rectangles to locate the cause.

**Why:** During a 320px mobile emulation check, `window.innerWidth` reported 405px while the CSS layout viewport was 320px; the actual navigation overflow extended the document to 405px.

**How to apply:** Use these measurements for browser-based responsive tests driven through the Chrome DevTools Protocol, especially when asserting that the full document fits a phone viewport.