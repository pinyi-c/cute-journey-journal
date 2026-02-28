/**
 * Copies the pdfjs-dist worker into public/ so it is served at /pdf.worker.min.mjs in dev and production.
 * Run by postinstall (after npm install).
 */
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build');
const publicDir = path.join(__dirname, '..', 'public');
const dest = path.join(publicDir, 'pdf.worker.min.mjs');

const candidates = [
  path.join(buildDir, 'pdf.worker.min.mjs'),
  path.join(buildDir, 'pdf.worker.mjs'),
  path.join(buildDir, 'pdf.worker.min.js'),
  path.join(buildDir, 'pdf.worker.js'),
];

for (const src of candidates) {
  if (fs.existsSync(src)) {
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.copyFileSync(src, dest);
    console.log('Copied', path.basename(src), '-> public/pdf.worker.min.mjs');
    process.exit(0);
  }
}
console.warn('pdfjs-dist worker not found in node_modules; run npm install. Public worker will be missing until then.');
