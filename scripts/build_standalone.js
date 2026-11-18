const fs = require('node:fs');

const css = fs.readFileSync('public/styles.css', 'utf8');
const appJs = fs.readFileSync('public/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

const shimJs = fs.readFileSync('scripts/browser_db_shim.js', 'utf8');

const standaloneHtml = html
  .replace('<link rel="stylesheet" href="/styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script src="/app.js"></script>', `<script>\n${shimJs}\n${appJs}\n</script>`);

const outPath = '/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f84f4fd3-e07a-4014-a248-e0832b56b387/5plus1_event_system.html';
fs.writeFileSync(outPath, standaloneHtml, 'utf8');
console.log('Generated standalone interactive HTML artifact:', outPath, 'Size:', Math.round(standaloneHtml.length / 1024), 'KB');
