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
const askBodies = [];
const priority8Only = process.argv.includes("--priority8");
const conversationSummaryOnly = process.argv.includes("--conversation-summary");
const uiOnly = process.argv.includes("--ui");
let mockHistoryMessages = [];
let clearConversationCalls = 0;
let clearConversationShouldFail = false;

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

  if (url.pathname === "/api/history" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      messages: conversationSummaryOnly ? mockHistoryMessages : [],
      conversation_id: "thread-test-user",
    }));
    return;
  }

  if (url.pathname === "/api/conversation/clear" && req.method === "POST") {
    clearConversationCalls += 1;
    if (clearConversationShouldFail) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        detail: {
          message: "Daily token limit exceeded",
          remaining_tokens: 100,
        },
      }));
      return;
    }
    mockHistoryMessages = [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      conversation_id: "thread-test-user",
      remaining_tokens: 5000,
      summarized: true,
    }));
    return;
  }

  if (url.pathname === "/api/ask" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      askBodies.push(body);
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
      if (query === "quota warning") {
        res.writeHead(429);
        res.end(JSON.stringify({
          detail: { message: "Daily token limit exceeded", remaining_tokens: 5000 },
        }));
        return;
      }
      if (query === "rate limited") {
        res.writeHead(429);
        res.end(JSON.stringify({ detail: "Too many chat requests" }));
        return;
      }
      if (query === "server failure") {
        res.writeHead(500);
        res.end(JSON.stringify({ detail: "Temporary backend failure" }));
        return;
      }
      if (query === "slow response") {
        setTimeout(() => {
          res.writeHead(200);
          res.end(JSON.stringify({
            answer: "Slow answer",
            citations: [],
            conversation_id: "test-conversation",
            remaining_tokens: 4500,
          }));
        }, 800);
        return;
      }
      if (query === "citation list") {
        res.writeHead(200);
        res.end(JSON.stringify({
          answer: "Answer without an inline citation marker.",
          citations: [{
            title: "Reference Guide p.2",
            url: `${APP_ORIGIN}/api/files/reference.pdf?file_token=test#page=2`,
          }],
          conversation_id: "test-conversation",
          remaining_tokens: 5000,
        }));
        return;
      }
      if (query === "formatted response") {
        res.writeHead(200);
        res.end(JSON.stringify({
          answer: "Review **The Scriptures Inspired** before continuing [1].",
          citations: [{
            title: "Statement of Faith",
            url: `${APP_ORIGIN}/api/files/statement.pdf?file_token=test#page=1`,
          }],
          conversation_id: "test-conversation",
          remaining_tokens: 5000,
        }));
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

async function clickText(cdp, selector, text) {
  await cdp.evaluate(`(() => {
    const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (!element) throw new Error('Missing ${text}');
    element.click();
  })()`);
}

async function openInfoDialog(cdp) {
  if (!await cdp.evaluate("Boolean(document.querySelector('#info-dialog-title'))")) {
    await cdp.evaluate("document.querySelector('.info-btn').click()");
  }
  await waitForSelector(cdp, "#info-dialog-title");
}

async function openClearDialog(cdp) {
  await openInfoDialog(cdp);
  await clickText(cdp, ".info-dialog button", "Clear chat history");
  await waitForSelector(cdp, "#clear-dialog-title");
}

async function runPriority8(cdp) {
  const freshIsolatedValidPage = async () => {
    await cdp.evaluate("try { sessionStorage.clear(); } catch {}");
    await freshValidPage(cdp);
  };

  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__sawAuthOverlay = false;
      window.__authOverlaySemantics = null;
      window.__authOverlayLayout = null;
      new MutationObserver(() => {
        const overlay = document.querySelector('.status-overlay');
        if (overlay) {
          const rect = overlay.getBoundingClientRect();
          window.__sawAuthOverlay = true;
          window.__authOverlaySemantics = [
            overlay.getAttribute('role'),
            overlay.getAttribute('aria-live'),
          ];
          window.__authOverlayLayout = {
            innerWidth,
            innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        }
      }).observe(document, { childList: true, subtree: true });
    `,
  });

  await freshIsolatedValidPage();
  assert.equal(await cdp.evaluate("window.__sawAuthOverlay"), true);
  assert.deepEqual(
    await cdp.evaluate("window.__authOverlaySemantics"),
    ["status", "polite"]
  );
  record("authentication checking overlay is rendered");

  const invalidSessions = [
    [{}, "Please log in"],
    [{ token: "malformed" }, "sign-in link is invalid"],
    [{ token: expiredToken }, "session has expired"],
    [{ token: wrongCapToken }, "not authorized"],
  ];
  for (const [params, expected] of invalidSessions) {
    await navigate(cdp, pageUrl({
      ...params,
      requireAuth: "1",
      requiredCap: "edit_posts",
      accessUrl: `${APP_ORIGIN}/access`,
    }));
    await waitFor(
      () => cdp.evaluate(
        `document.querySelector('.status-overlay')?.textContent.includes(${JSON.stringify(expected)})`
      ),
      `${expected} explanation`
    );
  }
  record("invalid hosted sessions explain missing, malformed, expired, and unauthorized access");

  for (const [query, expected] of [
    ["auth 401", "rejected your sign-in token"],
    ["auth 403", "not authorized"],
  ]) {
    await freshIsolatedValidPage();
    await setInputAndSend(cdp, query);
    await waitFor(
      () => cdp.evaluate(
        `document.querySelector('.dialog-panel')?.textContent.includes(${JSON.stringify(expected)})`
      ),
      `${query} authorization failure dialog`
    );
  }
  assert.deepEqual(
    await cdp.evaluate(`(() => {
      const link = document.querySelector('.dialog-link-button');
      return [link?.href, link?.target];
    })()`),
    ["https://pathway.training/wp-login.php", "_top"]
  );
  record("backend 401 and 403 failures explain access and provide the WordPress login link");

  async function openFailure() {
    await freshIsolatedValidPage();
    await setInputAndSend(cdp, "server failure");
    await waitForSelector(cdp, ".dialog-panel");
    assert.equal(
      await cdp.evaluate("Boolean(document.querySelector('.response-spinner'))"),
      false
    );
    assert.equal(
      await cdp.evaluate(
        "document.querySelector('.dialog-panel').textContent.includes('Temporary backend failure')"
      ),
      false
    );
  }

  await openFailure();
  await cdp.evaluate("document.querySelector('.dialog-close').click()");
  await waitFor(
    () => cdp.evaluate("!document.querySelector('.dialog-panel')"),
    "failure close icon"
  );
  await openFailure();
  await clickText(cdp, ".dialog-panel button", "Understood");
  await waitFor(
    () => cdp.evaluate("!document.querySelector('.dialog-panel')"),
    "failure understood button"
  );
  await openFailure();
  await cdp.evaluate(
    "document.querySelector('.dialog-backdrop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))"
  );
  await waitFor(
    () => cdp.evaluate("!document.querySelector('.dialog-panel')"),
    "failure backdrop"
  );
  await openFailure();
  await cdp.evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))"
  );
  await waitFor(
    () => cdp.evaluate("!document.querySelector('.dialog-panel')"),
    "failure escape"
  );
  record("generic failure dialog hides raw details and supports all dismissal paths");

  await freshIsolatedValidPage();
  await setInputAndSend(cdp, "rate limited");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.dialog-panel')?.textContent.includes('wait briefly')"
    ),
    "temporary rate-limit notification"
  );
  assert.equal(
    await cdp.evaluate(
      "document.querySelector('.dialog-panel').textContent.includes('daily')"
    ),
    false
  );
  record("temporary rate limit has a distinct notification");

  await freshIsolatedValidPage();
  await setInputAndSend(cdp, "slow response");
  await waitForSelector(cdp, ".send-spinner");
  await waitForSelector(cdp, ".response-spinner");
  assert.deepEqual(
    await cdp.evaluate(`(() => {
      const button = document.querySelector('.send-button');
      return [
        button?.disabled,
        button?.getAttribute('aria-label'),
        Boolean(document.querySelector('.thinking-overlay')),
        Boolean(document.querySelector('.rcb-log')),
        document.querySelector('.rcb-msg.ai:last-child .ai-title')?.textContent,
      ];
    })()`),
    [true, "Waiting for response", false, true, "Pathway's bot:"]
  );
  assert.equal(
    await cdp.evaluate("sessionStorage.getItem('chat_history')?.includes('\"pending\":true')"),
    false
  );
  await waitFor(
    () => cdp.evaluate("!document.querySelector('.send-spinner')"),
    "send spinner removal"
  );
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('.response-spinner'))"), false);
  assert.match(
    await cdp.evaluate("document.querySelector('.rcb-msg.ai:last-child .ai-text')?.textContent"),
    /Slow answer/
  );
  record("button spinner blocks duplicate sends while chat remains visible");

  await freshIsolatedValidPage();
  await setInputAndSend(cdp, "balance one");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.rcb-msg.ai:last-child')?.textContent.includes('Answer for balance one')"
    ),
    "balance before clear dialog"
  );
  await openInfoDialog(cdp);
  assert.match(
    await cdp.evaluate("document.querySelector('.info-dialog').textContent"),
    /5,000 daily tokens remaining/
  );

  await openClearDialog(cdp);
  assert.equal(
    await cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length"),
    1
  );
  await clickText(cdp, ".dialog-actions button", "Cancel");
  assert.equal(
    await cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length"),
    1
  );
  await cdp.evaluate("document.querySelector('.info-dialog .dialog-close').click()");
  record("clear confirmation Cancel preserves chat history");

  await openClearDialog(cdp);
  await cdp.evaluate("document.querySelector('#clear-dialog-title').parentElement.querySelector('.dialog-close').click()");
  await openClearDialog(cdp);
  await cdp.evaluate(
    "document.querySelector('.dialog-backdrop-nested').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))"
  );
  await openClearDialog(cdp);
  await cdp.evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))"
  );
  assert.equal(
    await cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length"),
    1
  );
  await cdp.evaluate("document.querySelector('.info-dialog .dialog-close').click()");
  record("clear confirmation close, backdrop, and Escape preserve chat history");

  await setInputAndSend(cdp, "quota warning");
  await waitForSelector(cdp, ".quota-alert");
  await clickText(cdp, ".dialog-panel button", "Understood");
  await cdp.evaluate(`(() => {
    const input = document.querySelector('#message');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(input, 'draft to clear');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  await openClearDialog(cdp);
  assert.match(
    await cdp.evaluate("document.querySelector('.dialog-panel').textContent"),
    /summarizes the visible chat/
  );
  assert.match(
    await cdp.evaluate("document.querySelector('.dialog-panel').textContent"),
    /Summarization uses daily tokens/
  );
  await clickText(cdp, ".dialog-actions button", "Clear chat");
  await waitFor(
    () => cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length === 0"),
    "confirmed clear"
  );
  assert.equal(await cdp.evaluate("sessionStorage.getItem('chat_history')"), null);
  assert.equal(await cdp.evaluate("document.querySelector('#message').value"), "");
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('.quota-alert'))"), false);
  await openInfoDialog(cdp);
  assert.equal(
    await cdp.evaluate(
      "document.querySelector('.info-dialog').textContent.includes('5,000 daily tokens remaining')"
    ),
    true
  );
  await cdp.evaluate("document.querySelector('.info-dialog .dialog-close').click()");
  await setInputAndSend(cdp, "after clear");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.send-button:not([disabled])') !== null"
    ),
    "post-clear response"
  );
  const postClearBody = askBodies.at(-1);
  assert.equal(postClearBody.query, "after clear");
  assert.equal(postClearBody.conversation_id, "thread-test-user");
  assert.deepEqual(postClearBody.history, []);
  record("confirmed clear resets frontend conversation state and preserves token balance");

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(cdp, pageUrl({
    requireAuth: "1",
    requiredCap: "edit_posts",
    accessUrl: `${APP_ORIGIN}/access`,
  }));
  await waitForSelector(cdp, ".status-overlay");
  const mobileAuthLayout = await cdp.evaluate(`(() => {
    const overlay = document.querySelector('.status-overlay').getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      left: overlay.left,
      right: overlay.right,
      top: overlay.top,
      bottom: overlay.bottom,
    };
  })()`);
  assert.ok(mobileAuthLayout.scrollWidth <= mobileAuthLayout.innerWidth);
  assert.ok(mobileAuthLayout.left >= 0 && mobileAuthLayout.right <= mobileAuthLayout.innerWidth);
  assert.ok(mobileAuthLayout.top >= 0 && mobileAuthLayout.bottom <= mobileAuthLayout.innerHeight);
  await freshIsolatedValidPage();
  await openClearDialog(cdp);
  const mobileLayout = await cdp.evaluate(`(() => {
    const panel = document.querySelector('.dialog-panel').getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      left: panel.left,
      right: panel.right,
      top: panel.top,
      bottom: panel.bottom,
    };
  })()`);
  assert.ok(mobileLayout.scrollWidth <= mobileLayout.innerWidth);
  assert.ok(mobileLayout.left >= 0 && mobileLayout.right <= mobileLayout.innerWidth);
  assert.ok(mobileLayout.top >= 0 && mobileLayout.bottom <= mobileLayout.innerHeight);
  await clickText(cdp, ".dialog-actions button", "Cancel");
  await setInputAndSend(cdp, "slow response");
  await waitForSelector(cdp, ".send-spinner");
  const mobileWaitingLayout = await cdp.evaluate(`(() => {
    const overlay = document.querySelector('.send-button').getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      left: overlay.left,
      right: overlay.right,
      top: overlay.top,
      bottom: overlay.bottom,
    };
  })()`);
  assert.ok(mobileWaitingLayout.scrollWidth <= mobileWaitingLayout.innerWidth);
  assert.ok(mobileWaitingLayout.left >= 0 && mobileWaitingLayout.right <= mobileWaitingLayout.innerWidth);
  assert.ok(mobileWaitingLayout.top >= 0 && mobileWaitingLayout.bottom <= mobileWaitingLayout.innerHeight);
  record("Priority 8 dialogs and overlays fit the mobile viewport");
}

async function runConversationSummary(cdp) {
  mockHistoryMessages = Array.from({ length: 12 }, (_, index) => [
    {
      who: "you",
      text: `visible question ${index + 1}`,
      citations: [],
      time: "10:00",
    },
    {
      who: "ai",
      text: `visible answer ${index + 1}`,
      citations: [],
      time: "10:00",
    },
  ]).flat();

  await freshValidPage(cdp);
  await waitFor(
    () => cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length === 12"),
    "durable visible history"
  );
  assert.equal(
    await cdp.evaluate("document.body.textContent.includes('private summary')"),
    false
  );
  assert.equal(
    await cdp.evaluate(
      "document.querySelector('.summary-token-notice')?.textContent.includes('additional daily tokens')"
    ),
    true
  );
  record("authenticated user loads only the 12 visible exchanges");

  await openClearDialog(cdp);
  const warning = await cdp.evaluate(
    "document.querySelector('.dialog-panel').textContent"
  );
  assert.match(warning, /Summarization uses daily tokens/);
  assert.match(warning, /existing token usage will not reset/);
  await clickText(cdp, ".dialog-actions button", "Clear chat");
  await waitFor(
    () => cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length === 0"),
    "summarized clear"
  );
  assert.equal(clearConversationCalls, 1);
  record("clear summarizes on the backend before removing visible history");

  mockHistoryMessages = [
    { who: "you", text: "keep this", citations: [], time: "10:01" },
    { who: "ai", text: "kept answer", citations: [], time: "10:01" },
  ];
  clearConversationShouldFail = true;
  await freshValidPage(cdp);
  await waitFor(
    () => cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length === 1"),
    "history before failed clear"
  );
  await openClearDialog(cdp);
  await clickText(cdp, ".dialog-actions button", "Clear chat");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.dialog-panel')?.textContent.includes('not enough daily tokens')"
    ),
    "failed summary notice"
  );
  assert.equal(
    await cdp.evaluate("document.querySelectorAll('.rcb-msg.you').length"),
    1
  );
  record("failed summarization keeps visible history");
}

async function runUi(cdp) {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: viewport.width < 600,
    });
    await freshValidPage(cdp);
    const layout = await cdp.evaluate(`(() => {
      const row = document.querySelector('.rcb-row').getBoundingClientRect();
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        rowLeft: row.left,
        rowRight: row.right,
      };
    })()`);
    assert.ok(layout.scrollWidth <= layout.innerWidth);
    assert.ok(layout.rowLeft >= 0 && layout.rowRight <= layout.innerWidth);
  }
  record("composer has no horizontal page overflow at desktop threshold or mobile widths");

  await freshValidPage(cdp);
  assert.equal(
    await cdp.evaluate("Boolean(document.querySelector('.chat-disclaimer, .token-estimate'))"),
    false
  );
  await openInfoDialog(cdp);
  assert.equal(
    await cdp.evaluate("document.querySelectorAll('.info-dialog-section').length"),
    3
  );
  assert.equal(
    await cdp.evaluate("document.querySelectorAll('.token-grid > *').length"),
    4
  );
  assert.match(
    await cdp.evaluate("document.querySelector('.info-dialog').textContent"),
    /This bot can make mistakes/
  );
  assert.match(
    await cdp.evaluate("document.querySelector('.daily-token-status')?.textContent"),
    /Daily balance\s*Waiting for the next backend balance/
  );
  record("info dialog contains guidance, 2x2 token details, daily balance, and clear action");

  await clickText(cdp, ".info-dialog button", "Clear chat history");
  await waitForSelector(cdp, "#clear-dialog-title");
  const dialogLayers = await cdp.evaluate(`(() => {
    const info = document.querySelector('.info-dialog').closest('.dialog-backdrop');
    const clear = document.querySelector('#clear-dialog-title').closest('.dialog-backdrop');
    return [Number(getComputedStyle(info).zIndex), Number(getComputedStyle(clear).zIndex)];
  })()`);
  assert.ok(dialogLayers[1] > dialogLayers[0]);
  await clickText(cdp, ".dialog-actions button", "Cancel");
  assert.equal(await cdp.evaluate("Boolean(document.querySelector('#info-dialog-title'))"), true);
  record("clear confirmation layers above and returns to the info dialog");

  await cdp.evaluate("document.querySelector('.dialog-close').click()");
  await setInputAndSend(cdp, "low balance");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.info-btn') && !document.querySelector('.send-spinner')"
    ),
    "low balance response"
  );
  await openInfoDialog(cdp);
  assert.match(
    await cdp.evaluate("document.querySelector('.daily-token-status')?.textContent"),
    /1,000 daily tokens remaining/
  );
  await cdp.evaluate("document.querySelector('.info-dialog .dialog-close').click()");
  const asksBeforeQuota = askBodies.length;
  await setInputAndSend(cdp, "request over remaining daily balance");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.dialog-panel')?.textContent.includes('Daily token limit')"
    ),
    "proactive daily quota dialog"
  );
  assert.equal(askBodies.length, asksBeforeQuota);
  record("known insufficient daily balance opens a dialog before an API request");

  await cdp.evaluate("document.querySelector('.dialog-panel button')?.click()");
  await freshValidPage(cdp);
  await setInputAndSend(cdp, "formatted response");
  await waitFor(
    () => cdp.evaluate(
      "document.querySelector('.rcb-msg.ai:last-child strong')?.textContent === 'The Scriptures Inspired'"
    ),
    "bold backend text"
  );
  await waitForSelector(cdp, ".rcb-msg.ai:last-child .inline-citation");
  assert.equal(
    await cdp.evaluate(
      "document.querySelector('.rcb-msg.ai:last-child .ai-text')?.textContent.includes('**')"
    ),
    false
  );
  assert.match(
    await cdp.evaluate("document.querySelector('.rcb-msg.ai:last-child .inline-citation')?.href"),
    /statement\.pdf\?file_token=test#page=1$/
  );
  record("balanced double-asterisk text renders bold alongside citation links");
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

    if (priority8Only) {
      await runPriority8(cdp);
      console.log(`\n${results.length} Priority 8 frontend checks passed.`);
      return;
    }
    if (conversationSummaryOnly) {
      await runConversationSummary(cdp);
      console.log(`\n${results.length} conversation summary frontend checks passed.`);
      return;
    }
    if (uiOnly) {
      await runUi(cdp);
      console.log(`\n${results.length} UI checks passed.`);
      return;
    }

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
        "document.querySelector('.rcb-msg.ai:last-child')?.textContent.includes('Answer for balance one')"
      ),
      "first remaining balance"
    );
    await openInfoDialog(cdp);
    assert.match(
      await cdp.evaluate("document.querySelector('.info-dialog').textContent"),
      /5,000 daily tokens remaining/
    );
    await cdp.evaluate("document.querySelector('.info-dialog .dialog-close').click()");
    record("valid JWT calls ask and displays remaining balance");

    await setInputAndSend(cdp, "balance two");
    await waitFor(
      () => cdp.evaluate(
        "document.querySelector('.rcb-msg.ai:last-child')?.textContent.includes('Answer for balance two')"
      ),
      "updated remaining balance"
    );
    await openInfoDialog(cdp);
    assert.match(
      await cdp.evaluate("document.querySelector('.info-dialog').textContent"),
      /3,000 daily tokens remaining/
    );
    await cdp.evaluate("document.querySelector('.info-dialog .dialog-close').click()");
    record("later success replaces remaining balance");

    await freshValidPage(cdp);
    await setInputAndSend(cdp, "citation list");
    await waitForSelector(cdp, ".rcb-cite");
    assert.match(
      await cdp.evaluate("document.querySelector('.rcb-cite')?.textContent"),
      /Sources:\s*\[1\] Reference Guide p\.2/
    );
    assert.match(
      await cdp.evaluate("document.querySelector('.rcb-cite a')?.href"),
      /\/api\/files\/reference\.pdf\?file_token=test#page=2$/
    );
    record("citation list remains visible without inline answer markers");

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
    const asksBeforeBlockedRequest = askBodies.length;
    await setInputAndSend(cdp, "request over remaining daily balance");
    await waitFor(
      () => cdp.evaluate(
        "document.querySelector('.dialog-panel')?.textContent.includes('Daily token limit')"
      ),
      "daily balance dialog"
    );
    assert.equal(askBodies.length, asksBeforeBlockedRequest);
    record("known insufficient balance opens a dialog before sending");

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
        "document.querySelector('.dialog-panel')?.textContent.includes('wait briefly')"
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

    await navigate(cdp, pageUrl({ token: localConfig.token }));
    try {
      await waitFor(
        () => cdp.evaluate(
          "Boolean(document.querySelector('.send-button:not([disabled])'))"
        ),
        "localhost Send button enabled"
      );
    } catch (error) {
      const state = await cdp.evaluate(`(() => ({
        href: location.href,
        body: document.body?.innerText,
        buttonDisabled: document.querySelector('.send-button')?.disabled,
      }))()`);
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    }
    await setInputAndSend(cdp, "local send");
    await waitFor(
      () => cdp.evaluate(
        "document.querySelector('.rcb-msg.ai:last-child')?.textContent.includes('Answer for local send')"
      ),
      "localhost request reaches configured local API"
    );
    await openInfoDialog(cdp);
    assert.match(
      await cdp.evaluate("document.querySelector('.info-dialog').textContent"),
      /5,000 daily tokens remaining/
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
