#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const [baseUrl, sessionToken, validBackupPath, alteredBackupPath, downloadPath, chromiumPath] =
  process.argv.slice(2);

if (![baseUrl, sessionToken, validBackupPath, alteredBackupPath, downloadPath, chromiumPath].every(Boolean)) {
  throw new Error("Expected the server URL, session token, backup files, download directory, and Chromium path.");
}

class DevToolsConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners.get(message.method) || []) {
          listener(message.params);
        }
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Could not connect to Chromium DevTools.")), {
        once: true,
      });
    });
    return new DevToolsConnection(socket);
  }

  command(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Chromium command ${method}.`));
      }, 10000);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, description, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function evaluate(connection, expression) {
  const result = await connection.command("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser script evaluation failed.");
  }
  return result.result.value;
}

async function selectBackup(connection, backupPath) {
  const { root } = await connection.command("DOM.getDocument");
  const { nodeId } = await connection.command("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "#extract-raw-backup-file",
  });
  if (!nodeId) throw new Error("The damaged-backup file picker was not present in the admin page.");
  await connection.command("DOM.setFileInputFiles", { files: [backupPath], nodeId });
  await waitFor(
    () => evaluate(connection, "document.querySelector('#extract-raw-backup').disabled === false"),
    "the selected backup to be ready",
  );
}

async function waitForStatus(connection, pattern, description) {
  return waitFor(async () => {
    const status = await evaluate(
      connection,
      "document.querySelector('#admin-inbox-recovery-status')?.textContent || ''",
    );
    return pattern.test(status) ? status : false;
  }, description);
}

async function checkRecoveryLayout(connection) {
  const widths = [320, 360, 390, 430, 480, 520, 600, 601, 768];
  for (const width of widths) {
    await connection.command("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const layout = await evaluate(connection, `(() => {
      const recovery = document.querySelector(".admin-inbox-recovery");
      const rawExtract = document.querySelector(".admin-inbox-raw-extract");
      const controls = [
        "#restore-message-backup-file",
        "#restore-message-backup",
        "#extract-raw-backup-file",
        "#extract-raw-backup",
      ].map((selector) => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        return {
          selector,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          parentRight: element.parentElement.getBoundingClientRect().right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      });
      const text = [
        document.querySelector(".admin-inbox-recovery-note"),
        rawExtract.querySelector("p"),
      ].map((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      }));
      const restore = getComputedStyle(document.querySelector("#restore-message-backup"));
      const extract = getComputedStyle(document.querySelector("#extract-raw-backup"));
      return {
        viewport: window.innerWidth,
        layoutViewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        recoveryRight: recovery.getBoundingClientRect().right,
        recoveryScrollWidth: recovery.scrollWidth,
        recoveryClientWidth: recovery.clientWidth,
        rawScrollWidth: rawExtract.scrollWidth,
        rawClientWidth: rawExtract.clientWidth,
        controls,
        text,
        restoreColor: restore.color,
        restoreBackground: restore.backgroundColor,
        extractColor: extract.color,
        extractBackground: extract.backgroundColor,
        overflowElements: Array.from(document.querySelectorAll("body *"))
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ rect }) => rect.right > document.documentElement.clientWidth + 1)
          .sort((left, right) => right.rect.right - left.rect.right)
          .slice(0, 6)
          .map(({ element, rect }) => ({
            tag: element.tagName,
            className: element.className?.baseVal || element.className || "",
            id: element.id,
            left: rect.left,
            right: rect.right,
            text: element.textContent?.trim().slice(0, 60) || "",
          })),
      };
    })()`);

    const issues = [];
    if (layout.documentWidth > layout.layoutViewport) {
      issues.push(`page scrolls horizontally (${layout.documentWidth}px versus ${layout.layoutViewport}px)`);
    }
    if (layout.recoveryScrollWidth > layout.recoveryClientWidth + 1) issues.push("recovery card overflows");
    if (layout.rawScrollWidth > layout.rawClientWidth + 1) issues.push("damaged-file card overflows");
    for (const control of layout.controls) {
      if (control.left < -1 || control.right > width + 1 || control.right > layout.recoveryRight + 1) {
        issues.push(`${control.selector} is outside the visible recovery area`);
      }
      if (control.scrollWidth > control.clientWidth + 1) {
        issues.push(`${control.selector} is clipped`);
      }
      if (width <= 600 && control.height < 44) {
        issues.push(`${control.selector} is shorter than the 44px phone touch target`);
      }
    }
    if (layout.text.some((item) => item.scrollWidth > item.clientWidth + 1 || item.fontSize < 11)) {
      issues.push("recovery explanation is clipped or too small");
    }
    if (layout.restoreBackground === layout.extractBackground || layout.restoreColor === layout.extractColor) {
      issues.push("restore and extraction actions are not visually distinct");
    }
    if (issues.length) {
      throw new Error(`Recovery layout failed at ${width}px: ${issues.join("; ")}. ${JSON.stringify(layout)}`);
    }
  }
  await connection.command("Emulation.clearDeviceMetricsOverride");
  console.log(`Admin recovery layout passed at ${widths.join(", ")}px.`);
}

async function run() {
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "admin-backup-chromium-"));
  const browser = spawn(
    chromiumPath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profilePath}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let browserConnection;
  let pageConnection;
  try {
    const activePortPath = path.join(profilePath, "DevToolsActivePort");
    await waitFor(() => fs.existsSync(activePortPath) || browser.exitCode !== null, "Chromium to start", 10000);
    if (browser.exitCode !== null) throw new Error(`Chromium exited with code ${browser.exitCode}.`);

    const port = fs.readFileSync(activePortPath, "utf8").split("\n")[0];
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    browserConnection = await DevToolsConnection.connect(version.webSocketDebuggerUrl);
    await browserConnection.command("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath,
      eventsEnabled: true,
    });

    const { targetId } = await browserConnection.command("Target.createTarget", { url: "about:blank" });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((target) => target.id === targetId);
    if (!page?.webSocketDebuggerUrl) throw new Error("Could not find the admin browser tab.");

    pageConnection = await DevToolsConnection.connect(page.webSocketDebuggerUrl);
    const requests = [];
    pageConnection.on("Network.requestWillBeSent", ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/messages/")) requests.push(url.pathname);
    });
    await pageConnection.command("Page.enable");
    await pageConnection.command("Network.enable");
    await pageConnection.command("DOM.enable");
    await pageConnection.command("Network.setCookie", {
      name: "admin_session",
      value: sessionToken,
      url: baseUrl,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });

    const loaded = new Promise((resolve) => pageConnection.on("Page.loadEventFired", resolve));
    await pageConnection.command("Page.navigate", { url: `${baseUrl}/admin.html` });
    await loaded;
    await waitFor(
      () => evaluate(pageConnection, "location.pathname === '/admin.html'"),
      "the authenticated admin dashboard",
    );
    const hasRecoveryControl = await evaluate(
      pageConnection,
      "Boolean(document.querySelector('#extract-raw-backup-form'))",
    );
    if (!hasRecoveryControl) throw new Error("The admin dashboard did not show damaged-backup recovery.");

    await checkRecoveryLayout(pageConnection);
    await selectBackup(pageConnection, validBackupPath);
    await evaluate(pageConnection, "document.querySelector('#extract-raw-backup-form').requestSubmit()");
    await waitForStatus(pageConnection, /integrity check passed/i, "the successful extraction message");
    const recoveredPath = path.join(downloadPath, "contact-inbox-recovered.bin");
    await waitFor(() => fs.existsSync(recoveredPath), "the recovered-file download");
    await waitFor(
      () => !fs.readdirSync(downloadPath).some((name) => name.endsWith(".crdownload")),
      "the recovered-file download to finish",
    );

    await selectBackup(pageConnection, alteredBackupPath);
    await evaluate(pageConnection, "document.querySelector('#extract-raw-backup-form').requestSubmit()");
    await waitForStatus(pageConnection, /integrity/i, "the altered-digest rejection message");
    await delay(500);

    const extractionRequests = requests.filter((url) => url === "/api/messages/extract-raw").length;
    const restoreRequests = requests.filter((url) => url === "/api/messages/restore").length;
    if (extractionRequests !== 2) {
      throw new Error(`Expected two extraction requests, received ${extractionRequests}.`);
    }
    if (restoreRequests !== 0) {
      throw new Error(`Extraction unexpectedly called the restore endpoint ${restoreRequests} time(s).`);
    }
    const downloads = fs.readdirSync(downloadPath).filter((name) => name.startsWith("contact-inbox-recovered"));
    if (downloads.length !== 1) {
      throw new Error(`Expected only the verified file to download, found: ${downloads.join(", ") || "none"}.`);
    }

    console.log("Authenticated admin extraction passed: verified bytes downloaded, altered digest rejected, restore untouched.");
  } finally {
    pageConnection?.close();
    browserConnection?.close();
    browser.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), delay(2000)]);
    if (browser.exitCode === null) browser.kill("SIGKILL");
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});