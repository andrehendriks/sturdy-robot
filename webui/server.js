const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');

const app = express();
const PORT = 3000;

// Liquidsoap telnet connection settings
const LIQUIDSOAP_HOST = 'liquidsoap.airadio.svc.cluster.local';
const LIQUIDSOAP_PORT = 1234;
const PLAYLISTS = {
  all: '/radio/music/Music',
  funk: '/radio/music/Music/Funk',
  soul: '/radio/music/Music/Soul',
  hiphop: '/radio/music/Music/HipHop',
  hardrock: '/radio/music/Music/HardRock',
  gothic: '/radio/music/Music/Gothic Funk'
};
const KUBERNETES_NAMESPACE = 'airadio';
const KUBERNETES_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const KUBERNETES_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const ICECAST_HOST = '192.168.2.5';
const ICECAST_PORT = 8030;

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    const liquidsoap = net.createConnection(LIQUIDSOAP_PORT, LIQUIDSOAP_HOST);
    let response = '';

    liquidsoap.setTimeout(5000);
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

function setPlaylist(uri) {
  return new Promise((resolve, reject) => {
    const liquidsoap = net.createConnection(LIQUIDSOAP_PORT, LIQUIDSOAP_HOST);

    liquidsoap.setTimeout(5000);
    liquidsoap.on('connect', () => {
      liquidsoap.write(`Music.uri ${uri}\n`);
      setTimeout(() => {
        liquidsoap.end();
        resolve();
      }, 250);
    });
    liquidsoap.on('timeout', () => liquidsoap.destroy(new Error('Playlist command timeout')));
    liquidsoap.on('error', reject);
  });
}

function setStreamRunning(running) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ spec: { replicas: running ? 1 : 0 } });
    const request = https.request({
      ca: fs.readFileSync(KUBERNETES_CA_PATH),
      headers: {
        Authorization: `Bearer ${fs.readFileSync(KUBERNETES_TOKEN_PATH, 'utf8')}`,
        'Content-Type': 'application/merge-patch+json',
        'Content-Length': Buffer.byteLength(body)
      },
      host: process.env.KUBERNETES_SERVICE_HOST,
      method: 'PATCH',
      path: `/apis/apps/v1/namespaces/${KUBERNETES_NAMESPACE}/deployments/liquidsoap/scale`,
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
          resolve(sources.find((stream) =>
            stream && stream.listenurl && stream.listenurl.endsWith('/live')
          ));
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
  try {
    await sendCommand('Music.skip');
    res.json({ status: 'skipped' });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/api/playlist', async (req, res) => {
  const musicPath = PLAYLISTS[req.body.playlist];
  if (!musicPath) {
    res.status(400).json({ error: 'Unknown playlist' });
    return;
  }

  try {
    await setPlaylist(musicPath);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const activePlaylist = await sendCommand('Music.uri');
    if (activePlaylist !== musicPath) {
      throw new Error(`Liquidsoap selected ${activePlaylist}, expected ${musicPath}`);
    }
    await sendCommand('Music.skip');
    res.json({ status: 'selected', playlist: req.body.playlist });
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/api/stream', async (req, res) => {
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
  const fs = require('fs');
  try {
    const musicDir = '/radio/music/Music';
    const files = fs.readdirSync(musicDir);
    res.json({ files: files.slice(0, 50) }); // Limit to first 50
  } catch (error) {
    res.status(500).json({ error: error.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Web UI running on port ${PORT}`);
});
