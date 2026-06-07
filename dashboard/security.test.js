const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const serverPath = path.join(__dirname, 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const localRequire = createRequire(serverPath);

function loadServer(envFile, environment = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-dashboard-security-'));
  if (envFile) fs.writeFileSync(path.join(tempDir, '.env'), envFile, 'utf8');

  const instrumented = source.replace(
    /app\.listen\(PORT,[\s\S]*$/,
    'module.exports = { SSH_HOST, SSH_USER, REMOTE_ROOT, localBackendToken, createSSHClient, remoteLocked };'
  );
  const sandboxProcess = Object.create(process);
  sandboxProcess.env = { ...environment };
  const sandbox = {
    Buffer,
    URL,
    clearTimeout,
    console,
    fetch,
    module: { exports: {} },
    process: sandboxProcess,
    require: localRequire,
    setTimeout,
    __dirname: tempDir,
    __filename: path.join(tempDir, 'server.js'),
  };
  vm.runInNewContext(instrumented, sandbox, { filename: serverPath });
  return sandbox.module.exports;
}

function decodePayload(token) {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

async function run() {
  assert(!/ec2-\d+(?:-\d+){3}\.[a-z0-9.-]*compute\.amazonaws\.com/i.test(source));

  const fromFile = loadServer(
    [
      'PATHWAY_SSH_HOST=file.example.test',
      'PATHWAY_SSH_USER=file-user',
      'PATHWAY_REMOTE_ROOT=/file/root',
    ].join('\n')
  );
  assert.strictEqual(fromFile.SSH_HOST, 'file.example.test');
  assert.strictEqual(fromFile.SSH_USER, 'file-user');
  assert.strictEqual(fromFile.REMOTE_ROOT, '/file/root');

  const fromProcess = loadServer('PATHWAY_SSH_HOST=file.example.test', {
    PATHWAY_SSH_HOST: 'process.example.test',
  });
  assert.strictEqual(fromProcess.SSH_HOST, 'process.example.test');

  const missingHost = loadServer(null);
  await assert.rejects(
    missingHost.createSSHClient(),
    /PATHWAY_SSH_HOST is not configured/
  );

  const configuredCaps = loadServer(null, {
    JWT_REQUIRED_CAP: 'ask_ai',
    JWT_DASHBOARD_CAP: 'manage_documents',
  });
  assert.deepStrictEqual(
    decodePayload(configuredCaps.localBackendToken()).cap,
    ['ask_ai', 'manage_documents']
  );

  const locked = loadServer(null);
  let nextCalled = false;
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  locked.remoteLocked({}, response, () => { nextCalled = true; });
  assert.strictEqual(response.statusCode, 423);
  assert.match(response.body.error, /locked/i);
  assert.strictEqual(nextCalled, false);

  console.log('Dashboard security configuration: 6 checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
