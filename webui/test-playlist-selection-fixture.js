const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

function getFreePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function selectPlaylist(port, playlist) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ playlist });
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/playlist',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode, body: responseBody }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function main() {
  let activePlaylist = '';
  const commands = [];
  const liquidsoap = net.createServer((socket) => {
    socket.on('data', (data) => {
      const command = data.toString().trim();
      commands.push(command);

      if (command === 'Music.uri') {
        socket.end(`${activePlaylist}\nEND\n`);
        return;
      }

      if (command.startsWith('Music.uri ')) {
        activePlaylist = command.slice('Music.uri '.length);
      }

      socket.end('OK\nEND\n');
    });
  });

  await new Promise((resolve) => liquidsoap.listen(0, '127.0.0.1', resolve));
  const liquidsoapPort = liquidsoap.address().port;
  const webuiPort = await getFreePort();
  const webui = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      LIQUIDSOAP_HOST: '127.0.0.1',
      LIQUIDSOAP_PORT: String(liquidsoapPort),
      PORT: String(webuiPort)
    }
  });

  try {
    let result;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        result = await selectPlaylist(webuiPort, 'blues');
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    assert.ok(result, 'WebUI did not start');
    assert.equal(result.statusCode, 200);
    assert.deepEqual(JSON.parse(result.body), { status: 'selected', playlist: 'blues' });
    assert.deepEqual(commands, [
      'Music.uri /radio/playlist/blues.m3u8',
      'Music.uri',
      'Music.skip'
    ]);
    assert.equal(activePlaylist, '/radio/playlist/blues.m3u8');
  } finally {
    webui.kill();
    await new Promise((resolve) => liquidsoap.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
