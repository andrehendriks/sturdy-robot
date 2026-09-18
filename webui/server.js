const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');

const app = express();
const PORT = parsePort(process.env.PORT, 3000, 'PORT');
const WEBUI_MODE = process.env.WEBUI_MODE || 'kubernetes';
const IS_SYNOLOGY_STANDALONE = WEBUI_MODE === 'synology';

const LIQUIDSOAP_HOST = process.env.LIQUIDSOAP_HOST || 'liquidsoap.airadio.svc.cluster.local';
const LIQUIDSOAP_PORT = parsePort(process.env.LIQUIDSOAP_PORT, 1234, 'LIQUIDSOAP_PORT');
const LIQUIDSOAP_COMMAND_TIMEOUT_MS = parseTimeout(
  process.env.LIQUIDSOAP_COMMAND_TIMEOUT_MS,
  30000
);
const PLAYLISTS = {
  all: '/radio/playlist/playlist.m3u8',
  blues: '/radio/playlist/blues.m3u8',
  funk: '/radio/playlist/funk.m3u8',
  soul: '/radio/playlist/soul.m3u8',
  hiphop: '/radio/playlist/hiphop.m3u8',
  hardrock: '/radio/playlist/hardrock.m3u8',
  hardstyle: '/radio/playlist/hardstyle.m3u8',
  gothic: '/radio/playlist/gothic.m3u8'
};
const KUBERNETES_NAMESPACE = process.env.KUBERNETES_NAMESPACE || 'airadio';
const LIQUIDSOAP_DEPLOYMENT = process.env.LIQUIDSOAP_DEPLOYMENT || 'liquidsoap';
const KUBERNETES_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const KUBERNETES_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const ICECAST_HOST = process.env.ICECAST_HOST || 'icecast.airadio.svc.cluster.local';
const ICECAST_PORT = parsePort(process.env.ICECAST_PORT, 8030, 'ICECAST_PORT');
const ICECAST_MOUNT = normalizeMount(process.env.ICECAST_MOUNT || '/stream.mp3');
let playlistSelectionQueue = Promise.resolve();

function parsePort(value, fallback, name) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }

  return port;
}

function parseTimeout(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
    throw new Error('LIQUIDSOAP_COMMAND_TIMEOUT_MS must be an integer between 1000 and 120000');
  }

  return timeout;
}

function normalizeMount(value) {
  const mount = value.trim();
  if (!mount || mount.includes('?') || mount.includes('#') || !/^\/?[A-Za-z0-9._~!$&'()*+,;=:@%-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)*$/.test(mount)) {
    throw new Error('ICECAST_MOUNT must be a non-empty URL path without a query or fragment');
  }

  return mount.startsWith('/') ? mount : `/${mount}`;
}

function sourceMatchesMount(source) {
  if (!source) {
    return false;
  }

  if (typeof source.mount === 'string') {
    try {
      if (normalizeMount(source.mount) === ICECAST_MOUNT) {
        return true;
      }
    } catch {
      return false;
    }
  }

  if (typeof source.listenurl !== 'string') {
    return false;
  }

  try {
    return new URL(source.listenurl).pathname === ICECAST_MOUNT;
  } catch {
    return false;
  }
}

function sendStandaloneUnavailable(res, capability) {
  res.status(503).json({
    error: `${capability} is unavailable in Synology standalone mode`,
    code: 'STANDALONE_UNAVAILABLE'
  });
}

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    const liquidsoap = net.createConnection(LIQUIDSOAP_PORT, LIQUIDSOAP_HOST);
    let response = '';

    liquidsoap.setTimeout(LIQUIDSOAP_COMMAND_TIMEOUT_MS);
    liquidsoap.on('connect', () => liquidsoap.write(`${cmd}\n`));
    liquidsoap.on('data', (data) => {
      response += data.toString();
      if (response.trimEnd().endsWith('END')) {
        liquidsoap.end();
        const output = response.trimEnd().replace(/(?:\r?\n)?END$/, '').trim();
        if (output.startsWith('ERROR:') || output.startsWith('No such command:')) {
          reject(new Error(output));
          return;
        }
        resolve(output);
      }
    });
    liquidsoap.on('timeout', () => liquidsoap.destroy(new Error('Command timeout')));
    liquidsoap.on('error', reject);
  });
}

async function setPlaylist(uri) {
  const response = await sendCommand(`Music.uri ${uri}`);
  if (response !== 'OK') {
    throw new Error(`Liquidsoap did not confirm playlist change: ${response || 'empty response'}`);
  }
}

function queuePlaylistSelection(operation) {
  const result = playlistSelectionQueue.then(operation, operation);
  playlistSelectionQueue = result.catch(() => {});
  return result;
}

function setStreamRunning(running) {
  return new Promise((resolve, reject) => {
    const kubernetesHost = process.env.KUBERNETES_SERVICE_HOST;
    if (!kubernetesHost) {
      reject(new Error('KUBERNETES_SERVICE_HOST is not set; Kubernetes mode requires an in-cluster ServiceAccount'));
      return;
    }

    const body = JSON.stringify({ spec: { replicas: running ? 1 : 0 } });
    const request = https.request({
      ca: fs.readFileSync(KUBERNETES_CA_PATH),
      headers: {
        Authorization: `Bearer ${fs.readFileSync(KUBERNETES_TOKEN_PATH, 'utf8').trim()}`,
        'Content-Type': 'application/merge-patch+json',
        'Content-Length': Buffer.byteLength(body)
      },
      host: kubernetesHost,
      method: 'PATCH',
      path: `/apis/apps/v1/namespaces/${KUBERNETES_NAMESPACE}/deployments/${LIQUIDSOAP_DEPLOYMENT}/scale`,
      port: process.env.KUBERNETES_SERVICE_PORT_HTTPS || 443
    }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        reject(new Error(`Kubernetes returned ${response.statusCode}: ${responseBody}`));
      });
    });

    request.on('error', reject);
    request.end(body);
  });
}

function getIcecastStatus() {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: ICECAST_HOST,
      path: '/status-json.xsl',
      port: ICECAST_PORT,
      headers: { 'Cache-Control': 'no-cache' },
      timeout: 5000
    }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Icecast returned ${response.statusCode}`));
          return;
        }

        try {
          const source = JSON.parse(responseBody).icestats.source;
          const sources = Array.isArray(source) ? source : [source];
          resolve(sources.find(sourceMatchesMount));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('timeout', () => request.destroy(new Error('Icecast request timeout')));
    request.on('error', reject);
  });
}

// API Routes
app.disable('etag');
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  next();
});
app.use(express.static('public'));
app.use(express.json());

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/capabilities', (req, res) => {
  res.json({
    mode: WEBUI_MODE,
    controlsAvailable: !IS_SYNOLOGY_STANDALONE,
    musicFilesAvailable: !IS_SYNOLOGY_STANDALONE
  });
});

// Get current status
app.get('/api/status', async (req, res) => {
  try {
    const source = await getIcecastStatus();
    res.set('Cache-Control', 'no-store');
    if (!source) {
      res.json({ status: 'stopped' });
      return;
    }

    res.json({
      status: 'ok',
      listeners: source.listeners,
      title: source.title
    });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

// Next track
app.post('/api/next', async (req, res) => {
  if (IS_SYNOLOGY_STANDALONE) {
    sendStandaloneUnavailable(res, 'Liquidsoap controls');
    return;
  }

  try {
    await sendCommand('Music.skip');
    res.json({ status: 'skipped' });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/api/playlist', async (req, res) => {
  if (IS_SYNOLOGY_STANDALONE) {
    sendStandaloneUnavailable(res, 'Playlist selection');
    return;
  }

  const musicPath = PLAYLISTS[req.body.playlist];
  if (!musicPath) {
    res.status(400).json({ error: 'Unknown playlist' });
    return;
  }

  try {
    await queuePlaylistSelection(async () => {
      await setPlaylist(musicPath);
      const activePlaylist = await sendCommand('Music.uri');
      if (activePlaylist !== musicPath) {
        throw new Error(`Liquidsoap selected ${activePlaylist}, expected ${musicPath}`);
      }
      await sendCommand('Music.skip');
    });
    res.json({ status: 'selected', playlist: req.body.playlist });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/api/stream', async (req, res) => {
  if (IS_SYNOLOGY_STANDALONE) {
    sendStandaloneUnavailable(res, 'Kubernetes stream scaling');
    return;
  }

  if (typeof req.body.running !== 'boolean') {
    res.status(400).json({ error: 'running must be a boolean' });
    return;
  }

  try {
    await setStreamRunning(req.body.running);
    res.json({ status: req.body.running ? 'started' : 'stopped' });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

// List files in music directory
app.get('/api/files', (req, res) => {
  if (IS_SYNOLOGY_STANDALONE) {
    sendStandaloneUnavailable(res, 'Music file access');
    return;
  }

  try {
    const musicDir = '/radio/music/Music';
    const files = fs.readdirSync(musicDir);
    res.json({ files: files.slice(0, 50) }); // Limit to first 50
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Web UI running on port ${PORT} in ${WEBUI_MODE} mode`);
});
