import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const APP_PORT = 6197;
const DEBUG_PORT = 6198;
const VITE_PORT = 6199;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const CHAT_ORIGIN = `http://chat.pathway.training:${APP_PORT}`;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIST = join(import.meta.dirname, "..", "dist");
const MIME = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".png": "image/png",
};

const results = [];

function record(name) {
  results.push(name);
  console.log(`PASS ${name}`);
}

function token(payload) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.test`;
}

function pageUrl(params = {}, origin = APP_ORIGIN) {
  const query = new URLSearchParams({
    apiBase: APP_ORIGIN,
    ...params,
  });
  return `${origin}/?${query}`;
}

const validToken = token({
  exp: Math.floor(Date.now() / 1000) + 3600,
  cap: ["edit_posts"],
});
const expiredToken = token({
  exp: Math.floor(Date.now() / 1000) - 60,
  cap: ["edit_posts"],
});
const wrongCapToken = token({
  exp: Math.floor(Date.now() / 1000) + 3600,
  cap: ["read"],
});

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", APP_ORIGIN);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/access") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Access</title><div id=\"access-page\">ACCESS PAGE</div>");
    return;
  }

  if (url.pathname === "/api/ask" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      const query = body.query || "";
      res.setHeader("Content-Type", "application/json");

      if (query === "auth 401") {
        res.writeHead(401);
        res.end(JSON.stringify({ detail: "Invalid token" }));
        return;
      }
      if (query === "auth 403") {
        res.writeHead(403);
        res.end(JSON.stringify({ detail: "Forbidden" }));
        return;
      }
      if (query === "quota zero") {
        res.writeHead(429);
        res.end(JSON.stringify({
          detail: { message: "Daily token limit exceeded", remaining_tokens: 0 },
        }));
        return;
      }
      if (query === "quota some") {
        res.writeHead(429);
        res.end(JSON.stringify({
          detail: { message: "Daily token limit exceeded", remaining_tokens: 500 },
        }));
        return;
      }
      if (query === "rate limited") {
        res.writeHead(429);
        res.end(JSON.stringify({ detail: "Too many chat requests" }));
        return;
      }

      const remaining = query === "low balance"
        ? 1000
        : query === "balance two"
          ? 3000
          : 5000;
      res.writeHead(200);
      res.end(JSON.stringify({
        answer: `Answer for ${query}`,
        citations: [],
        conversation_id: "test-conversation",
        remaining_tokens: remaining,
      }));
    });
    return;
  }

  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = join(DIST, relative);
  try {
    const content = readFileSync(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (!message.id) {
        for (const listener of this.listeners.get(message.method) || []) {
          listener(message.params);
        }
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.on("error", (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`Chrome socket error: ${error.message}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Chrome did not answer ${method}`));
      }, 10000);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    }
    return result.result.value;
  }
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(check, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(`Timed out: ${message}`);
}

async function connectBrowser() {
  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok;
    } catch {
      return false;
    }
  }, "Chrome debugging endpoint");

  const target = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" }
  ).then((response) => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const cdp = new Cdp(socket);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  return cdp;
}

async function navigate(cdp, url, waitForComplete = true) {
  await cdp.send("Page.navigate", { url });
  if (!waitForComplete) return;
  await waitFor(
    async () => (await cdp.evaluate("document.readyState")) === "complete",
    `page load for ${url}`
  );
}

async function waitForSelector(cdp, selector) {
  await waitFor(
    () => cdp.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    selector
  );
}

async function setInputAndSend(cdp, query) {
  await waitForSelector(cdp, "#message");
  await waitFor(
    () => cdp.evaluate(
      "Boolean(document.querySelector('.send-button:not([disabled])'))"
    ),
    "enabled Send button"
  );
  await cdp.evaluate(`(() => {
    const input = document.querySelector('#message');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(
    () => cdp.evaluate(
      `document.querySelector('#message')?.value === ${JSON.stringify(query)}`
    ),
    "React input update"
  );
  await cdp.evaluate("document.querySelector('.send-button')?.click()");
}

async function expectRedirect(cdp, url, expected) {
  await navigate(cdp, url);
  await waitFor(
    async () => (await cdp.evaluate("location.href")).startsWith(expected),
    `redirect to ${expected}`
  );
}

async function freshValidPage(cdp) {
  await navigate(cdp, pageUrl({
    token: validToken,
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    requireAuth: "1",
    requiredCap: "edit_posts",
    accessUrl: `${APP_ORIGIN}/access`,
  }));
  await waitForSelector(cdp, "#message");
}

async function run() {
  await new Promise((resolve) => server.listen(APP_PORT, "0.0.0.0", resolve));
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${join(process.env.TEMP || "C:\\tmp", `pathway-chat-test-${Date.now()}`)}`,
    `--host-resolver-rules=MAP chat.pathway.training 127.0.0.1`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let chromeErrors = "";
  chrome.stderr.on("data", (chunk) => {
    chromeErrors += chunk.toString();
  });
  chrome.on("exit", (code) => {
    if (code && chromeErrors) console.error(chromeErrors.trim());
  });

  let cdp;
  let vite;
  try {
    console.log("Starting headless Chrome frontend checks...");
    cdp = await connectBrowser();

    await expectRedirect(
      cdp,
      pageUrl({ accessUrl: `${APP_ORIGIN}/access` }, CHAT_ORIGIN),
      `${APP_ORIGIN}/access`
    );
    record("hosted chat redirects a missing token");

    await expectRedirect(
      cdp,
      pageUrl({
        token: "malformed",
        requireAuth: "1",
        accessUrl: `${APP_ORIGIN}/access`,
      }),
      `${APP_ORIGIN}/access`
    );
    record("malformed JWT redirects");

    await expectRedirect(
      cdp,
      pageUrl({
        token: expiredToken,
        requireAuth: "1",
        accessUrl: `${APP_ORIGIN}/access`,
      }),
      `${APP_ORIGIN}/access`
    );
    record("expired JWT redirects");

    await expectRedirect(
      cdp,
      pageUrl({
        token: wrongCapToken,
        requireAuth: "1",
        requiredCap: "edit_posts",
        accessUrl: `${APP_ORIGIN}/access`,
      }),
      `${APP_ORIGIN}/access`
    );
    record("incompatible capability redirects");

    await freshValidPage(cdp);
    await setInputAndSend(cdp, "balance one");
    await waitFor(
      () => cdp.evaluate(
        "document.querySelector('.token-estimate')?.textContent.includes('5,000 daily tokens remaining')"
      ),
      "first remaining balance"
    );
    record("valid JWT calls ask and displays remaining balance");

    await setInputAndSend(cdp, "balance two");
    await waitFor(
      () => cdp.evaluate(
        "document.querySelector('.token-estimate')?.textContent.includes('3,000 daily tokens remaining')"
      ),
      "updated remaining balance"
    );
    record("later success replaces remaining balance");

    for (const status of [401, 403]) {
      await freshValidPage(cdp);
      await setInputAndSend(cdp, `auth ${status}`);
      await waitFor(
        async () => (await cdp.evaluate("location.href")).startsWith(`${APP_ORIGIN}/access`),
        `${status} redirect`
      );
      record(`HTTP ${status} redirects`);
    }

    await navigate(cdp, pageUrl());
    await waitForSelector(cdp, "#message");
    assert.equal(await cdp.evaluate("location.pathname"), "/");
    record("ordinary tokenless widget mode does not redirect");

    const requestedUrls = [];
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      requestedUrls.push(request.url);
    });
    await navigate(cdp, pageUrl({
      requireAuth: "1",
      accessUrl: "https://evil.example/phish",
    }), false);
    await waitFor(
      () => requestedUrls.some((url) => url.startsWith("https://pathway.training/ask-ai/")),
      "untrusted redirect fallback request"
    );
    record("untrusted access URL uses Pathway fallback");

    await expectRedirect(
      cdp,
      pageUrl({
        requireAuth: "1",
        accessUrl: `${APP_ORIGIN}/access`,
      }),
      `${APP_ORIGIN}/access`
    );
    record("localhost access URL is allowed");

    await freshValidPage(cdp);
    await setInputAndSend(cdp, "low balance");
    await waitFor(
      () => cdp.evaluate("document.querySelector('.send-button')?.disabled === true"),
      "send disabled for low balance"
    );
    assert.equal(
      await cdp.evaluate("document.querySelector('.token-estimate')?.dataset.overLimit"),
      "true"
    );
    record("known insufficient balance disables Send");

    await freshValidPage(cdp);
    await setInputAndSend(cdp, "quota zero");
    await waitForSelector(cdp, ".quota-alert");
    assert.match(
      await cdp.evaluate("document.querySelector('.quota-alert').textContent"),
      /exhausted/
    );
    record("zero-balance quota response shows exhausted state");

    await freshValidPage(cdp);
    await setInputAndSend(cdp, "quota some");
    await waitForSelector(cdp, ".quota-alert");
    assert.match(
      await cdp.evaluate("document.querySelector('.quota-alert').textContent"),
      /500/
    );
    record("nonzero quota response shows remaining amount");

    await freshValidPage(cdp);
    await setInputAndSend(cdp, "rate limited");
    await waitFor(
      () => cdp.evaluate(
        "Array.from(document.querySelectorAll('.ai-text')).some((node) => node.textContent.includes('Too many chat requests'))"
      ),
      "generic rate-limit error"
    );
    assert.equal(await cdp.evaluate("Boolean(document.querySelector('.quota-alert'))"), false);
    record("short-window rate limit is not labeled as quota exhaustion");

    for (const viewport of [
      { width: 1440, height: 900, label: "desktop" },
      { width: 390, height: 844, label: "mobile" },
    ]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 600,
      });
      await freshValidPage(cdp);
      await setInputAndSend(cdp, "quota some");
      await waitForSelector(cdp, ".quota-alert");
      const layout = await cdp.evaluate(`(() => {
        const alert = document.querySelector('.quota-alert').getBoundingClientRect();
        const row = document.querySelector('.rcb-row').getBoundingClientRect();
        return {
          innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          alertLeft: alert.left,
          alertRight: alert.right,
          alertBottom: alert.bottom,
          rowTop: row.top,
        };
      })()`);
      assert.ok(layout.scrollWidth <= layout.innerWidth);
      assert.ok(layout.alertLeft >= 0 && layout.alertRight <= layout.innerWidth);
      assert.ok(layout.alertBottom <= layout.rowTop);
      record(`${viewport.label} quota layout has no overflow or overlap`);
    }

    const template = readFileSync(
      join(import.meta.dirname, "..", "page-ask-ai.php"),
      "utf8"
    );
    for (const parameter of [
      "'requireAuth' => '1'",
      "'requiredCap' => 'edit_posts'",
      "'accessUrl' => get_permalink()",
      "'token' => $token",
      "'exp' => $exp",
    ]) {
      assert.ok(template.includes(parameter), `Missing iframe parameter ${parameter}`);
    }
    record("WordPress template passes hosted auth parameters");

    vite = spawn(process.execPath, [
      join(import.meta.dirname, "..", "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(VITE_PORT),
      "--strictPort",
    ], {
      cwd: join(import.meta.dirname, ".."),
      env: {
        ...process.env,
        VITE_RAG_LOCAL_API_BASE: APP_ORIGIN,
      },
      stdio: "ignore",
      windowsHide: true,
    });
    await waitFor(async () => {
      try {
        return (await fetch(`http://127.0.0.1:${VITE_PORT}/__rag-dev-config`)).ok;
      } catch {
        return false;
      }
    }, "Vite local authentication endpoint", 10000);

    const localConfig = await fetch(
      `http://127.0.0.1:${VITE_PORT}/__rag-dev-config`
    ).then((response) => response.json());
    const localPayload = JSON.parse(
      Buffer.from(localConfig.token.split(".")[1], "base64url").toString()
    );
    assert.equal(localConfig.apiBase, APP_ORIGIN);
    assert.equal(localPayload.sub, "local-development");
    assert.ok(localPayload.cap.includes("edit_posts"));
    assert.ok(localPayload.exp > Math.floor(Date.now() / 1000) + 28000);
    record("Vite mints a short-lived loopback-only local user token");

    await navigate(cdp, `http://127.0.0.1:${VITE_PORT}/`);
    await waitFor(
      () => cdp.evaluate(
        "Boolean(document.querySelector('.send-button:not([disabled])'))"
      ),
      "localhost Send button enabled"
    );
    await setInputAndSend(cdp, "local send");
    await waitFor(
      () => cdp.evaluate(
        "document.querySelector('.token-estimate')?.textContent.includes('5,000 daily tokens remaining')"
      ),
      "localhost request reaches configured local API"
    );
    record("localhost Send button submits an authenticated local request");

    console.log(`\n${results.length} frontend security checks passed.`);
  } finally {
    try {
      if (cdp) await cdp.send("Browser.close");
    } catch {}
    if (!chrome.killed) chrome.kill();
    if (vite && !vite.killed) vite.kill();
    server.close();
  }
}

await run();
