import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');
const WS_URL = process.env.WS_URL || '';

const template = readFileSync(join(root, 'public/index.template.html'), 'utf-8');

const output = template
  .replaceAll('%%BASE_URL%%', BASE_URL)
  .replaceAll('%%WS_URL%%', WS_URL);

writeFileSync(join(root, 'public/index.html'), output, 'utf-8');

console.log(`[gen-config] BASE_URL="${BASE_URL}" WS_URL="${WS_URL}" → public/index.html`);
