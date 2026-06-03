const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { Client } = require('ssh2');
const https = require('https');
const http  = require('http');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = 3131;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Config ────────────────────────────────────────────────────────────────────
const PEM_KEY_PATH = 'D:/AI Chat/Pathway-Backend-Key.pem';
const SSH_HOST = 'ec2-3-14-127-116.us-east-2.compute.amazonaws.com';
const SSH_USER = 'ubuntu';
const REMOTE_DOCS = '/home/ubuntu/Pathway-AI-Chatbot/rag-backend/docs';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROMPT_FILE = path.join(PROJECT_ROOT, 'rag-backend', 'prompt.txt');


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

function createSSHClient() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn))
        .on('error', reject)
        .connect({ host: SSH_HOST, port: 22, username: SSH_USER, privateKey: getPrivateKey() });
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

let localProcs = [];
let backendLogs = [];

function startLocalServers() {
  if (localProcs.length) return;
  backendLogs = [];

  // uv.exe can be spawned directly; npm.cmd needs cmd.exe to interpret it
  const backend = spawn(UV_EXE, ['run', 'main.py'], {
    cwd: path.join(PROJECT_ROOT, 'rag-backend'),
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });

  const frontend = spawn('cmd', ['/c', 'npm', 'run', 'dev'], {
    cwd: path.join(PROJECT_ROOT, 'webapp'),
    windowsHide: true,
  });

  const capture = (data) => {
    const lines = data.toString().split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(l => {
      console.log('[backend]', l);
      backendLogs.push(l);
    });
    if (backendLogs.length > 200) backendLogs = backendLogs.slice(-200);
  };
  backend.stdout?.on('data', capture);
  backend.stderr?.on('data', capture);

  // Must handle error events or Node.js will crash the whole dashboard server
  backend.on('error',  (err) => { backendLogs.push(`[error] ${err.message}`); console.error('[backend]', err.message); });
  frontend.on('error', (err) => { backendLogs.push(`[frontend error] ${err.message}`); console.error('[frontend]', err.message); });

  localProcs = [backend, frontend];
  backend.on('exit',  (code) => {
    backendLogs.push(`[exited with code ${code}]`);
    localProcs = localProcs.filter(p => p !== backend);
  });
  frontend.on('exit', () => { localProcs = localProcs.filter(p => p !== frontend); });
}

function stopLocalServers() {
  for (const proc of localProcs) {
    try {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
    } catch {}
  }
  localProcs = [];
  backendLogs = [];
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
function gitExec(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || stdout || err.message));
      else resolve((stdout + stderr).trim());
    });
  });
}

// ── Multer (temp file storage for uploads) ────────────────────────────────────
const upload = multer({ dest: os.tmpdir() });

// ── Routes ────────────────────────────────────────────────────────────────────

// Backend startup logs (for debugging local mode)
app.get('/api/local-logs', (req, res) => {
  res.json({ logs: backendLogs, running: localProcs.length > 0 });
});

// Ping localhost:8000/api/health — returns {ready: bool}
function checkLocalBackend() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8000/api/health', { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

app.get('/api/local-health', async (req, res) => {
  if (!localProcs.length) return res.json({ ready: false, running: false });
  const ready = await checkLocalBackend();
  res.json({ ready, running: true });
});

// Current mode (live vs local)
app.get('/api/status', (req, res) => {
  try {
    res.json({ mode: detectMode() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle mode + start/stop local servers automatically
app.post('/api/toggle', (req, res) => {
  try {
    const current = detectMode();
    const target = current === 'live' ? 'local' : 'live';
    applyToggle(target);
    if (target === 'local') startLocalServers();
    else stopLocalServers();
    res.json({ mode: target });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload a document to the server via SFTP
app.post('/api/docs/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  try {
    await sftpUpload(req.file.path, originalName);
    fs.unlink(req.file.path, () => {});
    res.json({ success: true, filename: originalName });
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: e.message });
  }
});

// List documents on the server
app.get('/api/docs', async (req, res) => {
  try {
    const output = await sshExec(`ls -la "${REMOTE_DOCS}"`);
    const files = output.split('\n')
      .filter(line => /^-/.test(line))
      .map(line => {
        const parts = line.split(/\s+/);
        const name = parts.slice(8).join(' ');
        const size = parseInt(parts[4]) || 0;
        return { name, size };
      })
      .filter(f => f.name);
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a document from the server
app.delete('/api/docs/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  try {
    await sshExec(`rm "${REMOTE_DOCS}/${filename}"`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restart pm2 backend on server + call /api/reload with JWT auth
app.post('/api/server/restart', async (req, res) => {
  try {
    // 1. Restart the backend process
    await sshExec('pm2 restart rag-backend');

    // 2. Wait for it to come back up
    await new Promise(r => setTimeout(r, 3000));

    // 3. Read the JWT secret from the server's .env via SSH
    const envContent = await sshExec('cat /home/ubuntu/Pathway-AI-Chatbot/rag-backend/.env');
    const secretMatch = envContent.match(/^PATHWAY_RAG_JWT_SECRET=(.+)$/m);
    if (!secretMatch) throw new Error('PATHWAY_RAG_JWT_SECRET not found in server .env — ask your developer to add it');
    const jwtSecret = secretMatch[1].trim().replace(/^["']|["']$/g, '');

    // 4. Generate a short-lived token and call /api/reload
    const token = generateJWT(jwtSecret);
    await new Promise((resolve, reject) => {
      const reqOut = https.request(
        'https://api.chat.pathway.training/api/reload',
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } },
        (resp) => { resp.resume(); resolve(); }
      );
      reqOut.on('error', reject);
      reqOut.setTimeout(15000, () => reqOut.destroy(new Error('Reload request timed out')));
      reqOut.end();
    });

    res.json({ success: true, message: 'Backend restarted and bot reloaded.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sync prompt to server: git pull on server → pm2 restart → /api/reload
app.post('/api/server/sync-prompt', async (req, res) => {
  try {
    await sshExec('cd /home/ubuntu/Pathway-AI-Chatbot && git pull');
    await sshExec('pm2 restart rag-backend --update-env');
    await new Promise(r => setTimeout(r, 3000));

    const envContent = await sshExec('cat /home/ubuntu/Pathway-AI-Chatbot/rag-backend/.env');
    const secretMatch = envContent.match(/^PATHWAY_RAG_JWT_SECRET=(.+)$/m);
    if (!secretMatch) throw new Error('PATHWAY_RAG_JWT_SECRET not found in server .env');
    const jwtSecret = secretMatch[1].trim().replace(/^["']|["']$/g, '');
    const token = generateJWT(jwtSecret);

    await new Promise((resolve, reject) => {
      const reqOut = https.request(
        'https://api.chat.pathway.training/api/reload',
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } },
        (resp) => { resp.resume(); resolve(); }
      );
      reqOut.on('error', reject);
      reqOut.setTimeout(15000, () => reqOut.destroy(new Error('Reload request timed out')));
      reqOut.end();
    });

    res.json({ success: true, message: 'Server updated and bot reloaded with new prompt.' });
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

// Git: pull
app.post('/api/git/pull', async (req, res) => {
  try {
    const output = await gitExec('git pull');
    res.json({ output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Git: add + commit
app.post('/api/git/commit', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Commit message is required' });
  try {
    await gitExec('git add .');
    const output = await gitExec(`git commit -m ${JSON.stringify(message.trim())}`);
    res.json({ output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Git: push
app.post('/api/git/push', async (req, res) => {
  try {
    const output = await gitExec('git push');
    res.json({ output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Pathway Dashboard → http://localhost:${PORT}\n`);
});
