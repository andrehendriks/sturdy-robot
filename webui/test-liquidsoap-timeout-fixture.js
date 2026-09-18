const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const server = fs.readFileSync('server.js', 'utf8');

assert.match(server, /process\.env\.LIQUIDSOAP_COMMAND_TIMEOUT_MS,\s*30000/);
assert.match(server, /timeout < 1000 \|\| timeout > 120000/);
assert.match(server, /liquidsoap\.setTimeout\(LIQUIDSOAP_COMMAND_TIMEOUT_MS\);/);
assert.match(server, /playlistSelectionQueue = result\.catch\(\(\) => \{\}\);/);

function getFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function request(port) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/next',
      method: 'POST'
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body }));
    });
    request.on('error', reject);
    request.end();
  });
}

async function main() {
  const liquidsoap = net.createServer(() => {});
  await new Promise((resolve) => liquidsoap.listen(0, '127.0.0.1', resolve));
  const liquidsoapPort = liquidsoap.address().port;
  const webuiPort = await getFreePort();
  const webui = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: String(webuiPort),
      LIQUIDSOAP_HOST: '127.0.0.1',
      LIQUIDSOAP_PORT: String(liquidsoapPort),
      LIQUIDSOAP_COMMAND_TIMEOUT_MS: '1000'
    }
  });

  try {
    let result;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        result = await request(webuiPort);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(result, 'WebUI did not start');
    assert.equal(result.statusCode, 500);
    assert.match(result.body, /Command timeout/);
  } finally {
    webui.kill();
    await new Promise((resolve) => liquidsoap.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
