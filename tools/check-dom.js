const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/demo.js', 'utf8');

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
// DOM ids referenced in js, excluding hex colour literals like '#ff9c9c'
const jsIds = new Set([...js.matchAll(/'#([A-Za-z0-9_-]+)'/g)].map(m => m[1])
  .filter(v => !/^[0-9a-fA-F]{3,8}$/.test(v)));

const missing = [...jsIds].filter(i => !htmlIds.has(i));
console.log('ids in html:', htmlIds.size, '| ids referenced in js:', jsIds.size);
console.log(missing.length ? 'MISSING IN HTML: ' + missing.join(', ') : 'OK: every js id exists in html');

// classes used by js querySelectorAll vs defined in css
const css = fs.readFileSync('public/style.css', 'utf8');
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const jsClasses = new Set([...js.matchAll(/\$\$?\('\.([a-zA-Z][\w-]*)'\)/g)].map(m => m[1]));
const noCss = [...jsClasses].filter(c => !cssClasses.has(c));
console.log(noCss.length ? 'js classes with no css rule: ' + noCss.join(', ') : 'OK: all js-selected classes styled');

// tabs referenced in html data-tab vs panels
const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]);
const panels = [...html.matchAll(/id="tab-([^"]+)"/g)].map(m => m[1]);
console.log('tabs:', tabs.join(','), '| panels:', panels.join(','));
const orphan = tabs.filter(t => !panels.includes(t));
console.log(orphan.length ? 'ORPHAN TAB: ' + orphan.join(',') : 'OK: every tab has a panel');
