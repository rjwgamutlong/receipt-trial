// Builds ./wix-site/index.html (+logo): the app with the in-phone reader, no server needed.
import fs from 'fs';
const rules = fs.readFileSync(new URL('../static/rules.js', import.meta.url), 'utf8');
let local = fs.readFileSync(new URL('./local-reader.js', import.meta.url), 'utf8').replace('/*RULES*/', rules);
let html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const tag = '<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"></script>\n';
html = html.replace('<script>', tag + '<script>', 1); // before the app script
local = '(function(){\n' + local.replace('async function callApi(', 'window.callApi = async function(') + '\n})();';
html = html.replace(/<\/script>\s*<\/body>/, '</script>\n<script>\n' + local + '\n</script>\n</body>');
fs.mkdirSync(new URL('../wix-site/', import.meta.url), { recursive: true });
const RAW = process.env.APP_BASE || '';
if (RAW) html = html.replace(/src="jadj-logo\.png"/g, 'src="' + RAW + 'jadj-logo.png"');
fs.writeFileSync(new URL('../wix-site/app.html', import.meta.url), html);
fs.copyFileSync(new URL('../public/jadj-logo.png', import.meta.url), new URL('../wix-site/jadj-logo.png', import.meta.url));
console.log('built', html.length);
