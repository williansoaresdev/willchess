import fs from 'fs';
import sharp from 'sharp';
const knight = `<g fill="none" fill-rule="evenodd" stroke="#2a160a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#a8703a"/>
<path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#a8703a"/>
<path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#2a160a"/>
<path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z" fill="#c68a4d" stroke="none"/>
</g>`;
const W = `<polyline points="17.2,26 20.4,37 24.4,29 28.4,37 32,26" fill="none" stroke="#fff" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/>`;
const defs = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a3519"/><stop offset="1" stop-color="#2e1a0c"/></linearGradient></defs>`;
const icon = (scale, round) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
<rect width="512" height="512" rx="${round}" fill="url(#bg)"/>
<g transform="translate(${256 - 22.5 * scale} ${256 - 22.5 * scale + 6}) scale(${scale})">${knight}${W}</g></svg>`;
fs.writeFileSync('public/icons/icon.svg', icon(9.6, 96));
fs.writeFileSync('public/favicon.svg', icon(9.6, 96));
const any = Buffer.from(icon(9.6, 96)), mask = Buffer.from(icon(7.4, 0));
await sharp(any).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(any).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(mask).resize(512).png().toFile('public/icons/maskable-512.png');
await sharp(any).resize(180).png().toFile('public/icons/apple-touch-icon.png');
// splash knight (no bg)
fs.writeFileSync('src/knight.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${knight.replace('#a8703a','#d9a066').replace('#a8703a','#d9a066')}${W}</svg>`);

// Open Graph / social share image (1200x630)
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a3519"/><stop offset="1" stop-color="#241209"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<g opacity=".18">${Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ((x + y) % 2 ? `<rect x="${700 + x * 63}" y="${60 + y * 63}" width="63" height="63" fill="#e8c99b"/>` : '')).join('')).join('')}</g>
<g transform="translate(690 95) scale(10.4)">${knight.replace(/#a8703a/g, '#d9a066')}${W}</g>
<text x="80" y="290" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="120" fill="#e8c99b">WillChess</text>
<text x="84" y="360" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#c68a4d">Melhore suas habilidades</text>
<text x="84" y="410" font-family="Segoe UI, Arial, sans-serif" font-size="38" fill="#c68a4d">no jogo dos reis</text>
<rect x="84" y="460" width="360" height="64" rx="32" fill="#c68a4d"/>
<text x="264" y="504" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="30" fill="#2a160a">Treino de xadrez</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og-image.png');
