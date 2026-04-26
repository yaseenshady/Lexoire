#!/usr/bin/env node

const { execFileSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const root = __dirname;
const source = join(root, 'assets', 'icon.svg');
const target = join(root, 'assets', 'icon.png');

if (!existsSync(source)) {
  console.error(`Missing source icon: ${source}`);
  process.exit(1);
}

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

function commandExists(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (commandExists('magick')) {
  run('magick', [
    '-background',
    'none',
    '-density',
    '1024',
    source,
    '-resize',
    '1024x1024',
    target,
  ]);
} else if (commandExists('rsvg-convert')) {
  run('rsvg-convert', ['-w', '1024', '-h', '1024', source, '-o', target]);
} else if (commandExists('sips')) {
  run('sips', ['-s', 'format', 'png', '-z', '1024', '1024', source, '--out', target]);
} else {
  console.error('Install ImageMagick or librsvg to compile electron/assets/icon.svg.');
  process.exit(1);
}

console.log(`Compiled ${target}`);
