const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

const serverPath = path.join(__dirname, 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');
const dashboardHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const localRequire = createRequire(serverPath);

function loadServer(envFile, environment = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-dashboard-security-'));
  if (envFile) fs.writeFileSync(path.join(tempDir, '.env'), envFile, 'utf8');

  const instrumented = source.replace(
    /app\.listen\(PORT,[\s\S]*$/,
    'module.exports = { SSH_HOST, SSH_USER, REMOTE_ROOT, BACKEND_ENV_FILE, localBackendToken, createSSHClient, remoteLocked, documentTarget, validDocumentName, validLocalService, shellQuote, remoteGitBaseCommand, validCommitMessage, readTokenLimits, writeBackendEnvValue };'
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

  assert.strictEqual(locked.documentTarget({ query: {} }), 'local');
  assert.strictEqual(locked.documentTarget({ query: { target: 'ec2' } }), 'ec2');
  assert.strictEqual(locked.documentTarget({ query: { target: 'production' } }), null);

  assert.strictEqual(locked.validDocumentName('guide.pdf'), true);
  assert.strictEqual(locked.validDocumentName('../guide.pdf'), false);
  assert.strictEqual(locked.validDocumentName('script.exe'), false);

  assert.strictEqual(locked.validLocalService('backend'), true);
  assert.strictEqual(locked.validLocalService('frontend'), true);
  assert.strictEqual(locked.validLocalService('database'), false);

  assert.strictEqual(locked.shellQuote("/home/ubuntu/Pathway-AI-Chatbot"), "'/home/ubuntu/Pathway-AI-Chatbot'");
  assert.strictEqual(locked.shellQuote("Pathway's prompt"), "'Pathway'\\''s prompt'");
  assert.strictEqual(locked.remoteGitBaseCommand(), `git -C ${locked.shellQuote(locked.REMOTE_ROOT)}`);
  assert.strictEqual(locked.validCommitMessage('docs: update prompt'), true);
  assert.strictEqual(locked.validCommitMessage(''), false);
  assert.strictEqual(locked.validCommitMessage('bad\nmessage'), false);
  assert.strictEqual(locked.validCommitMessage('x'.repeat(161)), false);
  fs.mkdirSync(path.dirname(locked.BACKEND_ENV_FILE), { recursive: true });
  fs.writeFileSync(
    locked.BACKEND_ENV_FILE,
    [
      'CHAT_DAILY_TOKEN_LIMIT=90000',
      'CHAT_INPUT_TOKEN_LIMIT=2500',
      'LLM_MAX_OUTPUT_TOKENS=900',
    ].join('\n'),
    'utf8'
  );
  assert.strictEqual(
    JSON.stringify(locked.readTokenLimits().map(limit => [limit.name, limit.value])),
    JSON.stringify([
      ['CHAT_DAILY_TOKEN_LIMIT', 90000],
      ['CHAT_INPUT_TOKEN_LIMIT', 2500],
      ['LLM_MAX_OUTPUT_TOKENS', 900],
    ])
  );
  locked.writeBackendEnvValue('CHAT_INPUT_TOKEN_LIMIT', 3000);
  assert.match(fs.readFileSync(locked.BACKEND_ENV_FILE, 'utf8'), /CHAT_INPUT_TOKEN_LIMIT=3000/);
  assert.match(source, /\/api\/server\/git-status/);
  assert.match(source, /\/api\/token-limits/);
  assert.match(source, /readRemoteTokenLimits/);
  assert.match(source, /writeRemoteTokenLimits/);
  assert.match(source, /pm2 restart rag-backend --update-env/);
  assert.match(source, /target === 'ec2'/);
  assert.match(source, /push origin/);
  assert.match(source, /Dashboard API route not found/);
  assert.match(source, /req\.path\.startsWith\('\/api'\)/);
  assert.match(dashboardHtml, /checkRemoteBranch/);
  assert.match(dashboardHtml, /syncPromptToEc2/);
  assert.match(dashboardHtml, /Token Usage Limits/);
  assert.match(dashboardHtml, /localTokenLimitBtn/);
  assert.match(dashboardHtml, /ec2TokenLimitBtn/);
  assert.match(dashboardHtml, /setTokenLimitTarget/);
  assert.match(dashboardHtml, /dailyTokenLimit/);
  assert.match(dashboardHtml, /saveTokenLimits/);
  assert.match(dashboardHtml, /target=\$\{tokenLimitTarget\}/);
  assert.match(dashboardHtml, /readDashboardJsonResponse/);
  assert.match(dashboardHtml, /content-type/);
  assert.match(dashboardHtml, /returned non-JSON response/);
  assert.match(dashboardHtml, /Commit and push prompt\.txt to the active EC2 branch/);

  console.log('Dashboard security configuration: 32 checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
