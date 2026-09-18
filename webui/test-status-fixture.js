const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const source = {
  listenurl: 'http://nas.stream-vught.eu:8000/stream.mp3',
  listeners: 7,
  title: 'Validated stream'
};

function request(port) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/api/status' }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body }));
    }).on('error', reject);
  });
}

function getFreePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  const icecast = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ icestats: { source } }));
  });

  await new Promise((resolve) => icecast.listen(0, '127.0.0.1', resolve));
  const icecastPort = icecast.address().port;
  const webuiPort = await getFreePort();
  const webui = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      ICECAST_HOST: '127.0.0.1',
      ICECAST_PORT: String(icecastPort),
      ICECAST_MOUNT: '/stream.mp3',
      PORT: String(webuiPort)
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
    assert.equal(result.statusCode, 200);
    assert.deepEqual(JSON.parse(result.body), {
      status: 'ok',
      listeners: 7,
      title: 'Validated stream'
    });
  } finally {
    webui.kill();
    await new Promise((resolve) => icecast.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
