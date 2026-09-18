const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');
const frontend = fs.readFileSync('public/index.html', 'utf8');

assert.match(server, /hardstyle: '\/radio\/playlist\/hardstyle\.m3u8'/);
assert.match(frontend, /<option value="hardstyle">.*Hardstyle<\/option>/);
assert.match(frontend, /\['hardstyle', 'Hardstyle'\]/);
assert.match(server, /blues: '\/radio\/playlist\/blues\.m3u8'/);
assert.match(frontend, /<option value="blues">.*Blues<\/option>/);
assert.match(frontend, /\['blues', 'Blues'\]/);
assert.match(server, /all: '\/radio\/playlist\/playlist\.m3u8'/);
assert.match(frontend, /<option value="all">.*All Music \(Various\)<\/option>/);
assert.match(server, /funk: '\/radio\/playlist\/funk\.m3u8'/);
assert.match(server, /soul: '\/radio\/playlist\/soul\.m3u8'/);
assert.match(server, /hiphop: '\/radio\/playlist\/hiphop\.m3u8'/);
assert.match(server, /hardrock: '\/radio\/playlist\/hardrock\.m3u8'/);
assert.match(server, /gothic: '\/radio\/playlist\/gothic\.m3u8'/);
assert.doesNotMatch(server, /\/radio\/music\/Music\//);
