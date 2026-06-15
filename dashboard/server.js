const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Client } = require('ssh2');
const https = require('https');
const http  = require('http');
const os = require('os');
const crypto = require('crypto');

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const separator = line.indexOf('=');
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(name in process.env)) process.env[name] = value;
  }
}

loadLocalEnv(path.join(__dirname, '.env'));

const app = express();
const PORT = 3131;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Config ────────────────────────────────────────────────────────────────────
const PEM_KEY_PATH = process.env.PATHWAY_SSH_KEY_PATH || 'D:/AI Chat/Pathway-Backend-Key.pem';
const SSH_HOST = process.env.PATHWAY_SSH_HOST || '';
const SSH_USER = process.env.PATHWAY_SSH_USER || 'ubuntu';
const REMOTE_ROOT = process.env.PATHWAY_REMOTE_ROOT || '/home/ubuntu/Pathway-AI-Chatbot';
const REMOTE_DOCS = `${REMOTE_ROOT}/rag-backend/docs`;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROMPT_FILE = path.join(PROJECT_ROOT, 'rag-backend', 'prompt.txt');
const BACKEND_ENV_FILE = path.join(PROJECT_ROOT, 'rag-backend', '.env');
const LOCAL_DOCS = path.join(PROJECT_ROOT, 'rag-backend', 'docs');
const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000';
const LOCAL_FRONTEND_URL = 'http://localhost:5173';
const REMOTE_API_ENABLED = false;
const LOCAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');


// ── Toggle file definitions ───────────────────────────────────────────────────
// Each entry has the exact two-line block as it appears in live vs local mode.
// Newlines are normalized to \n when reading files.
const TOGGLE_FILES = [
  {
    name: 'webapp/index.html',
    file: path.join(PROJECT_ROOT, 'webapp', 'index.html'),
    live:  '        // apiBase: "http://localhost:8000", // RAG backend locally\n        apiBase: "https://api.chat.pathway.training",',
    local: '        apiBase: "http://localhost:8000", // RAG backend locally\n        // apiBase: "https://api.chat.pathway.training",',
  },
  {
    name: 'webapp/src/main.tsx',
    file: path.join(PROJECT_ROOT, 'webapp', 'src', 'main.tsx'),
    live:  "  const apiBase: string = cfg.apiBase || 'https://api.chat.pathway.training'\n  // const apiBase: string = cfg.apiBase || 'http://localhost:8000'",
    local: "  // const apiBase: string = cfg.apiBase || 'https://api.chat.pathway.training'\n  const apiBase: string = cfg.apiBase || 'http://localhost:8000'",
  },
  {
    name: 'rag-backend/rag.py',
    file: path.join(PROJECT_ROOT, 'rag-backend', 'rag.py'),
    live:  '    # api_base = os.getenv("API_BASE", "http://localhost:8000").rstrip("/")\n    api_base = os.getenv("API_BASE", "https://api.chat.pathway.training").rstrip("/")',
    local: '    api_base = os.getenv("API_BASE", "http://localhost:8000").rstrip("/")\n    # api_base = os.getenv("API_BASE", "https://api.chat.pathway.training").rstrip("/")',
  },
];

// ── SSH helpers ───────────────────────────────────────────────────────────────
function getPrivateKey() {
  try {
    return fs.readFileSync(PEM_KEY_PATH);
  } catch (e) {
    throw new Error(`Cannot read PEM key at ${PEM_KEY_PATH}: ${e.message}`);
  }
}

function createSSHClient(retries = 3, delayMs = 2000) {
  if (!SSH_HOST) {
    return Promise.reject(new Error('PATHWAY_SSH_HOST is not configured'));
  }
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const conn = new Client();
      conn.on('ready', () => resolve(conn))
          .on('error', (err) => {
            conn.end();
            if (remaining > 1) {
              setTimeout(() => attempt(remaining - 1), delayMs);
            } else {
              reject(err);
            }
          })
          .connect({
            host: SSH_HOST, port: 22,
            username: SSH_USER,
            privateKey: getPrivateKey(),
            readyTimeout: 30000,
          });
    };
    attempt(retries);
  });
}

async function sshExec(command) {
  const conn = await createSSHClient();
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) { conn.end(); return reject(err); }
      let out = '', errOut = '';
      stream
        .on('close', (code) => {
          conn.end();
          code === 0 ? resolve(out) : reject(new Error(errOut || `SSH command exited with code ${code}`));
        })
        .on('data', d => out += d)
        .stderr.on('data', d => errOut += d);
    });
  });
}

async function sftpUpload(localPath, remoteName) {
  const conn = await createSSHClient();
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); return reject(err); }
      const remotePath = `${REMOTE_DOCS}/${remoteName}`;
      sftp.fastPut(localPath, remotePath, err => {
        conn.end();
        err ? reject(err) : resolve();
      });
    });
  });
}

async function sftpListDocuments() {
  const conn = await createSSHClient();
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); return reject(err); }
      sftp.readdir(REMOTE_DOCS, (readErr, entries) => {
        conn.end();
        if (readErr) return reject(readErr);
        resolve(entries
          .filter(entry => entry.attrs && entry.attrs.isFile())
          .map(entry => ({ name: entry.filename, size: entry.attrs.size }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      });
    });
  });
}

async function sftpDelete(remoteName) {
  const conn = await createSSHClient();
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); return reject(err); }
      sftp.unlink(`${REMOTE_DOCS}/${remoteName}`, unlinkErr => {
        conn.end();
        unlinkErr ? reject(unlinkErr) : resolve();
      });
    });
  });
}

async function sftpUploadTo(localPath, fullRemotePath) {
  const conn = await createSSHClient();
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { conn.end(); return reject(err); }
      sftp.fastPut(localPath, fullRemotePath, err => {
        conn.end();
        err ? reject(err) : resolve();
      });
    });
  });
}

// ── Local server management ───────────────────────────────────────────────────

// Find uv.exe by checking known Windows install locations
function findUv() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'uv.exe'),
    path.join(os.homedir(), '.cargo', 'bin', 'uv.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'uv', 'bin', 'uv.exe'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'uv'; // last resort
}

const UV_EXE = findUv();
console.log(`uv → ${UV_EXE}`);

const localProcs = { backend: null, frontend: null };
let backendLogs = [];
let frontendLogs = [];

function captureOutput(service, data) {
  const lines = data.toString()
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const logs = service === 'backend' ? backendLogs : frontendLogs;
  lines.forEach(l => {
    console.log(`[${service}]`, l);
    logs.push(l);
  });
  if (logs.length > 200) logs.splice(0, logs.length - 200);
}

function startLocalBackend() {
  if (localProcs.backend) return false;
  backendLogs = [];

  const backend = spawn(UV_EXE, ['run', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000'], {
    cwd: path.join(PROJECT_ROOT, 'rag-backend'),
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PATHWAY_RAG_JWT_SECRET: readEnvValue('PATHWAY_RAG_JWT_SECRET') || LOCAL_JWT_SECRET,
    },
  });

  backend.stdout?.on('data', data => captureOutput('backend', data));
  backend.stderr?.on('data', data => captureOutput('backend', data));
  backend.on('error', (err) => {
    backendLogs.push(`[error] ${err.message}`);
    console.error('[backend]', err.message);
  });
  backend.on('exit', (code) => {
    backendLogs.push(`[exited with code ${code}]`);
    localProcs.backend = null;
  });
  localProcs.backend = backend;
  return true;
}

function startLocalFrontend() {
  if (localProcs.frontend) return false;
  frontendLogs = [];
  const frontend = spawn('cmd', ['/c', 'npm', 'run', 'dev'], {
    cwd: path.join(PROJECT_ROOT, 'webapp'),
    windowsHide: true,
  });
  frontend.stdout?.on('data', data => captureOutput('frontend', data));
  frontend.stderr?.on('data', data => captureOutput('frontend', data));
  frontend.on('error', (err) => {
    frontendLogs.push(`[error] ${err.message}`);
    console.error('[frontend]', err.message);
  });
  frontend.on('exit', (code) => {
    frontendLogs.push(`[exited with code ${code}]`);
    localProcs.frontend = null;
  });
  localProcs.frontend = frontend;
  return true;
}

function validLocalService(service) {
  return service === 'backend' || service === 'frontend';
}

function stopLocalService(service) {
  if (!validLocalService(service)) {
    return Promise.reject(new Error('Invalid local service'));
  }
  const proc = localProcs[service];
  if (!proc) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      localProcs[service] = null;
      if (error) reject(error);
      else resolve(true);
    };
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
      let errorText = '';
      killer.stderr?.on('data', data => { errorText += data.toString(); });
      killer.on('error', finish);
      killer.on('exit', code => finish(code === 0 ? null : new Error(errorText.trim() || `taskkill exited with code ${code}`)));
      return;
    }
    try {
      proc.kill('SIGTERM');
      finish();
    } catch (error) {
      finish(error);
    }
  });
}

function stopLocalServers() {
  for (const proc of Object.values(localProcs)) {
    if (!proc) continue;
    try {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
    } catch {}
  }
  localProcs.backend = null;
  localProcs.frontend = null;
  backendLogs = [];
  frontendLogs = [];
}

// Clean up if the dashboard itself is closed
process.on('exit', stopLocalServers);
process.on('SIGINT', () => { stopLocalServers(); process.exit(); });

// ── JWT helper ────────────────────────────────────────────────────────────────
// Generates a short-lived HS256 JWT matching the backend's verify_api_key logic.
// Requires no external packages — uses Node's built-in crypto module.
function generateJWT(secret, caps = ['edit_posts'], ttlSeconds = 300) {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    cap: caps,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function readEnvValue(name) {
  if (!fs.existsSync(BACKEND_ENV_FILE)) return process.env[name] || '';
  const line = fs.readFileSync(BACKEND_ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .find(entry => entry.trim().startsWith(`${name}=`));
  if (!line) return process.env[name] || '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}

function localBackendToken() {
  const secret = readEnvValue('PATHWAY_RAG_JWT_SECRET') || LOCAL_JWT_SECRET;
  const requiredCap = readEnvValue('JWT_REQUIRED_CAP') || 'edit_posts';
  const dashboardCap = readEnvValue('JWT_DASHBOARD_CAP') || 'manage_rag';
  return generateJWT(secret, [...new Set([requiredCap, dashboardCap].filter(Boolean))]);
}

async function callLocalBackend(route, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${localBackendToken()}`,
  };
  const response = await fetch(`${LOCAL_BACKEND_URL}${route}`, { ...options, headers });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { detail: text }; }
  if (!response.ok) {
    const error = new Error(body.detail || body.error || `Backend returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function remoteLocked(req, res, next) {
  if (REMOTE_API_ENABLED) return next();
  return res.status(423).json({
    error: 'Remote server actions are locked until the updated backend is tested and approved for deployment.',
  });
}

function documentTarget(req) {
  const target = String(req.query.target || 'local').toLowerCase();
  return target === 'local' || target === 'ec2' ? target : null;
}

function validDocumentName(filename) {
  return filename === path.basename(filename)
    && !filename.includes('\\')
    && ['.md', '.txt', '.html', '.pdf'].includes(path.extname(filename).toLowerCase());
}

// ── Toggle helpers ────────────────────────────────────────────────────────────
function readNorm(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function detectMode() {
  const { file, live } = TOGGLE_FILES[0];
  const content = readNorm(file);
  if (content.includes(live)) return 'live';
  return 'local';
}

function applyToggle(targetMode) {
  const errors = [];
  for (const entry of TOGGLE_FILES) {
    let content = readNorm(entry.file);
    const from = targetMode === 'live' ? entry.local : entry.live;
    const to   = targetMode === 'live' ? entry.live  : entry.local;
    if (content.includes(to)) continue; // already in target state
    if (!content.includes(from)) {
      errors.push(`Pattern not found in ${entry.name}`);
      continue;
    }
    content = content.replace(from, to);
    fs.writeFileSync(entry.file, content, 'utf8');
  }
  if (errors.length) throw new Error(errors.join('; '));
}

// ── Git helper ────────────────────────────────────────────────────────────────
// ── Multer (temp file storage for uploads) ────────────────────────────────────
const upload = multer({ dest: os.tmpdir() });

// ── Routes ────────────────────────────────────────────────────────────────────

// Backend startup logs (for debugging local mode)
app.get('/api/local-logs', (req, res) => {
  res.json({
    backendLogs,
    frontendLogs,
    backendRunning: Boolean(localProcs.backend),
    frontendRunning: Boolean(localProcs.frontend),
  });
});

// Ping localhost:8000/api/health — returns {ready: bool}
function checkLocalUrl(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 2000 }, (response) => {
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => { request.destroy(); resolve(false); });
  });
}

app.get('/api/local-health', async (req, res) => {
  const [backendReady, frontendReady] = await Promise.all([
    checkLocalUrl(`${LOCAL_BACKEND_URL}/api/health`),
    checkLocalUrl(LOCAL_FRONTEND_URL),
  ]);
  res.json({
    backend: { ready: backendReady, launched: Boolean(localProcs.backend) },
    frontend: { ready: frontendReady, launched: Boolean(localProcs.frontend) },
  });
});

app.post('/api/local/start/backend', (req, res) => {
  try {
    const started = startLocalBackend();
    res.json({ success: true, started, url: LOCAL_BACKEND_URL });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/local/start/frontend', (req, res) => {
  try {
    const started = startLocalFrontend();
    res.json({ success: true, started, url: LOCAL_FRONTEND_URL });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Current mode (live vs local)
app.get('/api/status', (req, res) => {
  res.json({ mode: 'local', remoteEnabled: REMOTE_API_ENABLED });
});

// Toggle mode + start/stop local servers automatically
app.post('/api/toggle', remoteLocked, (req, res) => {
  res.json({ mode: detectMode() });
});

// Upload through the authenticated local backend API.
app.post('/api/docs/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const target = documentTarget(req);
  if (!target) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Invalid document target' });
  }
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  if (!validDocumentName(originalName)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Invalid or unsupported filename' });
  }
  try {
    if (target === 'ec2') {
      await sftpUpload(req.file.path, originalName);
      await sshExec('pm2 restart rag-backend --update-env');
      res.json({ success: true, target, filename: originalName });
    } else {
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(req.file.path)]), originalName);
      const result = await callLocalBackend('/api/upload', {
        method: 'POST',
        body: form,
      });
      res.json({ success: true, target, ...result });
    }
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// List documents from the selected local or EC2 backend docs folder.
app.get('/api/docs', async (req, res) => {
  const target = documentTarget(req);
  if (!target) return res.status(400).json({ error: 'Invalid document target' });
  try {
    if (target === 'ec2') {
      return res.json({ files: await sftpListDocuments(), target });
    }
    fs.mkdirSync(LOCAL_DOCS, { recursive: true });
    const files = fs.readdirSync(LOCAL_DOCS, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const stat = fs.statSync(path.join(LOCAL_DOCS, entry.name));
        return { name: entry.name, size: stat.size };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ files, target });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/local/stop/:service', async (req, res) => {
  if (!validLocalService(req.params.service)) {
    return res.status(400).json({ error: 'Invalid local service' });
  }
  try {
    const stopped = await stopLocalService(req.params.service);
    res.json({ success: true, stopped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete from the selected environment, then synchronize its backend index.
app.delete('/api/docs/:filename', async (req, res) => {
  const target = documentTarget(req);
  if (!target) return res.status(400).json({ error: 'Invalid document target' });
  const filename = req.params.filename;
  if (!validDocumentName(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  try {
    if (target === 'ec2') {
      await sftpDelete(filename);
      await sshExec('pm2 restart rag-backend --update-env');
      return res.json({ success: true, target });
    }
    const filePath = path.join(LOCAL_DOCS, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const original = fs.readFileSync(filePath);
    fs.unlinkSync(filePath);
    try {
      await callLocalBackend('/api/reload', { method: 'POST' });
    } catch (reloadError) {
      fs.writeFileSync(filePath, original);
      throw new Error(`Index reload failed; local file was restored. ${reloadError.message}`);
    }
    res.json({ success: true, target });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Call /api/reload via localhost on the server (bypasses nginx, no auth needed)
async function sshReload() {
  const status = await sshExec(
    `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/reload`
  );
  if (status.trim() !== '200') throw new Error(`Reload returned HTTP ${status.trim()}`);
}

// Restart pm2 backend on server + reload index via localhost (bypasses nginx)
app.post('/api/server/restart', remoteLocked, async (req, res) => {
  try {
    await sshExec('pm2 restart rag-backend --update-env');
    await new Promise(r => setTimeout(r, 3000));
    await sshReload();
    res.json({ success: true, message: 'Backend restarted and bot reloaded.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sync prompt to server: SFTP prompt.txt → restart only (no re-index needed,
// prompt.txt is read fresh on every query)
app.post('/api/server/sync-prompt', remoteLocked, async (req, res) => {
  try {
    await sftpUploadTo(
      PROMPT_FILE,
      `${REMOTE_ROOT}/rag-backend/prompt.txt`
    );
    await sshExec('pm2 restart rag-backend --update-env');
    res.json({ success: true, message: 'Prompt synced — bot will use it on the next query.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get bot prompt
app.get('/api/prompt', (req, res) => {
  try {
    const content = fs.existsSync(PROMPT_FILE) ? fs.readFileSync(PROMPT_FILE, 'utf8') : '';
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save bot prompt
app.post('/api/prompt', (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content is required' });
  try {
    fs.writeFileSync(PROMPT_FILE, content, 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Pathway Dashboard → http://localhost:${PORT}\n`);
});
