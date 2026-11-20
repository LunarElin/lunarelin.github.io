'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { compileFunction } = require('node:vm');

const browserWindow = {};
for (const filename of ['../src/rules.js', '../src/game.js', 'harness.js', 'tests.js']) {
  const path = join(__dirname, filename);
  const source = readFileSync(path, 'utf8');
  compileFunction(source, ['window', 'JD'], { filename: path })(browserWindow, browserWindow.JD);
}

for (const { id, title, run } of browserWindow.JD.acceptanceCases) {
  test(id + ' ' + title, () => {
    run((label, expected, actual) => assert.deepStrictEqual(actual, expected, label));
  });
}
