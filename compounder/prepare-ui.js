import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'public', 'index.html');

const html = await fs.readFile(indexPath, 'utf8');
const scriptTag = '<script src="/monthly-chart.js?v=4"></script>';

let next = html;
if (/\/monthly-chart\.js(?:\?v=\d+)?/.test(next)) {
  next = next.replace(/<script src="\/monthly-chart\.js(?:\?v=\d+)?"><\/script>/, scriptTag);
} else {
  next = next.replace('</body>', `${scriptTag}</body>`);
}

if (next !== html) {
  await fs.writeFile(indexPath, next, 'utf8');
  console.log('Compounder UI prepared: monthly chart script refreshed to v4.');
} else {
  console.log('Compounder UI prepared: monthly chart script v4 already present.');
}
