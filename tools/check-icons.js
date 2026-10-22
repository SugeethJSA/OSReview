const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/demo.js', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

// symbols defined in the sprite
const defined = new Set([...html.matchAll(/<symbol id="i-([\w-]+)"/g)].map(m => m[1]));

// icons referenced from js: ic('name') and ic(ICONS[st.key] ... )
const used = new Set();
for (const m of js.matchAll(/\bic\(\s*'([\w-]+)'/g)) used.add(m[1]);

// ICONS map values -> which are used as ic(ICONS[...])
const iconMap = js.match(/const ICONS = \{[\s\S]*?\};/);
if (iconMap) for (const m of iconMap[0].matchAll(/:\s*'([\w-]+)'/g)) used.add(m[1]);

// app.js RESOURCES icon fields
for (const m of app.matchAll(/icon:\s*'([\w-]+)'/g)) used.add(m[1]);

// inline <use href="#i-name"> in html
for (const m of html.matchAll(/href="#i-([\w-]+)"/g)) used.add(m[1]);

const missing = [...used].filter(u => !defined.has(u));
const unused = [...defined].filter(d => !used.has(d));

console.log('sprite symbols defined :', defined.size);
console.log('icons referenced        :', used.size);
console.log(missing.length ? 'MISSING SYMBOLS (will render blank): ' + missing.join(', ')
                           : 'OK: every referenced icon exists in the sprite');
if (unused.length) console.log('defined but unused     : ' + unused.join(', '));

// no emoji anywhere in shipped files
const files = ['app.js', 'README.md', 'public/index.html', 'public/demo.js',
               'public/style.css', 'public/manifest.json', 'public/sw.js'];
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2705}\u{274C}\u{2B50}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
let hits = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    const m = l.match(emoji);
    if (m) { hits++; console.log('  EMOJI ' + f + ':' + (i + 1) + ' ' + m[0]); }
  });
}
console.log(hits ? 'EMOJI LEFT: ' + hits : 'OK: no emoji in any shipped file');
process.exit(missing.length || hits ? 1 : 0);
