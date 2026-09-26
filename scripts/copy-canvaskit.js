// Copies Skia's CanvasKit WebAssembly into public/ so web builds can load it (not committed: ~7 MB).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'canvaskit-wasm', 'bin', 'full', 'canvaskit.wasm');
const dest = path.join(__dirname, '..', 'public', 'canvaskit.wasm');
if (fs.existsSync(src)) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
