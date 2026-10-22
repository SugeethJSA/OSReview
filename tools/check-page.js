const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2705}\u{274C}\u{2B50}\u{FE0F}]/gu;
const m = s.match(re);
console.log('emoji in served HTML :', m ? [...new Set(m)].join(' ') : 'NONE');
console.log('sprite symbols       :', (s.match(/<symbol /g) || []).length);
console.log('inline <use> refs    :', (s.match(/href="#i-/g) || []).length);
console.log('boot splash present  :', s.includes('id="boot"'));
