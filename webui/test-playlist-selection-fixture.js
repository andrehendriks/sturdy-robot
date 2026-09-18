const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');

assert.match(server, /const response = await sendCommand\(`Music\.uri \$\{uri\}`\);/);
assert.match(server, /if \(response !== 'OK'\)/);
assert.match(server, /let playlistSelectionQueue = Promise\.resolve\(\);/);
assert.match(server, /const result = playlistSelectionQueue\.then\(operation, operation\);/);
assert.match(server, /playlistSelectionQueue = result\.catch\(\(\) => \{\}\);/);
assert.match(
  server,
  /await queuePlaylistSelection\(async \(\) => \{\s+await setPlaylist\(musicPath\);\s+const activePlaylist = await sendCommand\('Music\.uri'\);\s+if \(activePlaylist !== musicPath\) \{[\s\S]+?\}\s+await sendCommand\('Music\.skip'\);\s+\}\);/
);
assert.doesNotMatch(server, /setTimeout\(\(\) => \{\s+liquidsoap\.end\(\);/);
