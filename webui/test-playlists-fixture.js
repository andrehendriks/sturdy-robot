const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');
const frontend = fs.readFileSync('public/index.html', 'utf8');

assert.match(server, /hardstyle: '\/radio\/music\/Music\/Hardstyle'/);
assert.match(frontend, /<option value="hardstyle">.*Hardstyle<\/option>/);
assert.match(frontend, /\['hardstyle', 'Hardstyle'\]/);
assert.match(server, /all: '\/radio\/music\/Music\/Various'/);
assert.match(frontend, /<option value="all">.*All Music \(Various\)<\/option>/);
