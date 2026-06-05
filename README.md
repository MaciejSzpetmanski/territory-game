# Territory

A small React canvas territory-capture game. Expand your territory, trace loops to claim space, cut enemy trails, and survive.

## Features

- 2–4 players
- Human and AI players
- Adjustable board size, game speed, and level seed
- Seeded procedural map generation
- Canvas-based pixel-art rendering
- Keyboard controls for local multiplayer

## Controls

| Player | Controls |
| --- | --- |
| Player 1 | Arrow keys |
| Player 2 | WASD |
| Player 3 | IJKL |
| Player 4 | Numpad 8 / 2 / 4 / 6 |

Other controls:

- `Space` — pause / resume
- `M` — return to menu
- `R` — reserved for restart

## Getting started

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deploying

This project is a standard Vite React app, so it can be deployed to GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host.

## Project structure

```text
territory-game/
├── index.html
├── package.json
├── README.md
├── src/
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
└── .gitignore
```

## License

Add a license before publishing if you want others to reuse or modify the game under clear terms.
