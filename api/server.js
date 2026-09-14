const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const MUSIC_ROOT = process.env.MUSIC_ROOT || '/music';
const PLAYLIST_ROOT = process.env.PLAYLIST_ROOT || '/playlists';

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get music files
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(MUSIC_ROOT).slice(0, 100);
    res.json({ files });
  } catch (err) {
    res.json({ files: [], error: err.message });
  }
});

// Get playlists
app.get('/api/playlists', (req, res) => {
  try {
    const playlists = fs.readdirSync(PLAYLIST_ROOT).filter(f => f.endsWith('.m3u'));
    res.json({ playlists });
  } catch (err) {
    res.json({ playlists: [], error: err.message });
  }
});

// Create playlist
app.post('/api/playlist', (req, res) => {
  res.json({ status: 'created', playlist: req.body.name });
});

// Search music
app.get('/api/search', (req, res) => {
  res.json({ results: [] });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DJ Library API running on port ${PORT}`);
});
