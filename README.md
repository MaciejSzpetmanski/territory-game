# Territory

A fast-paced multiplayer territory-conquest game built with React.

Expand your territory, draw trails outside your borders, capture new land, and eliminate opponents before they eliminate you. Inspired by classic territory-control arcade games, **Territory** combines strategic expansion, risk management, and competitive survival.

---

## Features

* 🎮 Local multiplayer support for up to 4 players
* 🤖 AI opponents with Easy, Medium, and Hard difficulty levels
* 🗺️ Procedurally generated maps with configurable seeds
* ⚡ Adjustable game speed
* 👑 Domination victory system
* 🏆 Last-player-standing elimination mode
* 🎨 Modern neon-inspired visual design
* 📱 Responsive canvas scaling for different screen sizes

---

## Gameplay

Each player starts with a small territory.

To expand:

1. Leave your territory.
2. Draw a trail through neutral space.
3. Return safely to your own territory.
4. The enclosed area becomes yours.

Be careful:

* If another player crosses your active trail, you are eliminated.
* Crossing your own trail before reconnecting to your territory can be fatal.
* Holding more than 50% of the playable map for 30 seconds triggers a domination victory.

---

## Controls

### Player 1

* Move: Arrow Keys

### Player 2

* Move: WASD

### Player 3

* Move: IJKL

### Player 4

* Move: Numpad 8, 4, 2, 6

### Game Controls

* Space — Pause / Resume
* M — Return to Menu
* R — Restart

---

## Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/territory-game.git
cd territory-game
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open your browser and navigate to:

```text
http://localhost:5173
```

---

## Build for Production

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

## Technology Stack

* React
* Vite
* HTML5 Canvas
* JavaScript (ES6+)

---

## Project Structure

```text
territory-game/
├── src/
│   ├── App.jsx
│   └── main.jsx
├── public/
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Future Ideas

* Online multiplayer
* Match statistics
* Power-ups and special abilities
* Additional map generation styles
* Mobile touch controls
* Tournament mode
* Sound effects and music


---

## Contributing

Contributions, suggestions, and bug reports are welcome.

Feel free to fork the repository and submit pull requests.

---

## License

This project is licensed under the MIT License.

See the LICENSE file for details.

