# WillChess

PWA de treinamento de xadrez (PT-BR / EN / ES). Sem login, dados apenas no IndexedDB do dispositivo.

- Engine: Stockfish 19 (WASM lite, single-thread) em Web Worker — GPLv3
- Regras: chess.js · Tabuleiro: chessground
- Offline + instalável (Windows/Android) via vite-plugin-pwa

```bash
npm install
npm run dev      # desenvolvimento
npm run build    # gera dist/ (service worker + manifest)
npm run preview  # testa a build / instalação PWA
node scripts/icons.mjs  # regenera os ícones
```
