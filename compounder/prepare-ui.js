import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'public', 'index.html');

const html = await fs.readFile(indexPath, 'utf8');
const scriptTag = '<script src="/monthly-chart.js?v=3"></script>';

let next = html;
if (!html.includes('/monthly-chart.js')) {
  next = html.replace('</body>', `${scriptTag}</body>`);
}

if (next !== html) {
  await fs.writeFile(indexPath, next, 'utf8');
  console.log('Compounder UI prepared: monthly chart script injected.');
} else {
  console.log('Compounder UI prepared: monthly chart script already present.');
}
