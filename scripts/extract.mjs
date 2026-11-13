import fs from 'fs';
const css=fs.readFileSync('node_modules/chessground/assets/chessground.cburnett.css','utf8');
const parts=css.split('piece.knight.');
for (const p of parts.slice(1)){
  const c=p.slice(0,5);
  const b=p.match(/base64,([A-Za-z0-9+/=]+)/)[1];
  console.log(c, Buffer.from(b,'base64').toString());
}
