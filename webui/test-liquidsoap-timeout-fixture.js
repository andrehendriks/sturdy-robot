const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');

assert.match(server, /process\.env\.LIQUIDSOAP_COMMAND_TIMEOUT_MS,\s*30000/);
assert.match(server, /timeout < 1000 \|\| timeout > 120000/);
assert.match(server, /LIQUIDSOAP_COMMAND_TIMEOUT_MS must be an integer between 1000 and 120000/);
assert.match(server, /liquidsoap\.setTimeout\(LIQUIDSOAP_COMMAND_TIMEOUT_MS\);/);
assert.match(server, /liquidsoap\.on\('timeout', \(\) => liquidsoap\.destroy\(new Error\('Command timeout'\)\)\);/);
assert.match(server, /playlistSelectionQueue = result\.catch\(\(\) => \{\}\);/);
