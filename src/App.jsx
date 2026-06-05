import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PCOLORS = ['#4fffb0','#ff5f6b','#ffd93d','#6bcbff'];
const P_RGB   = ['79,255,176','255,95,107','255,217,61','107,203,255'];
const PNAMES  = ['Player 1','Player 2','Player 3','Player 4'];
const WALL    = 255;
const CELL    = 8;
const DOMINATION_MS = 30000;
const SPEEDS  = [0, 300, 220, 160, 110, 70];

const DIRMAP = {
  ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
  w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
  W:[0,-1], S:[0,1], A:[-1,0], D:[1,0],
  i:[0,-1], k:[0,1], j:[-1,0], l:[1,0],
  I:[0,-1], K:[0,1], J:[-1,0], L:[1,0],
  Numpad8:[0,-1], Numpad2:[0,1], Numpad4:[-1,0], Numpad6:[1,0],
};
const PKEYS = [
  new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']),
  new Set(['w','s','a','d','W','S','A','D']),
  new Set(['i','k','j','l','I','K','J','L']),
  new Set(['Numpad8','Numpad2','Numpad4','Numpad6']),
];

// ─── SEEDED RNG ───────────────────────────────────────────────────────────────
function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967296; };
}

// ─── MAP GENERATION ───────────────────────────────────────────────────────────
function generateGame(cfg) {
  const { size: S, seed, types } = cfg;
  const active = types.map((t,i) => t !== 'off' ? i : -1).filter(i => i >= 0);
  const TSIZE = Math.max(5, Math.floor(S / 8));
  const corners = [[1,1],[S-1-TSIZE,1],[1,S-1-TSIZE],[S-1-TSIZE,S-1-TSIZE]];
  const spawns = active.map((_,i) => [
    corners[i%4][0] + Math.floor(TSIZE/2),
    corners[i%4][1] + Math.floor(TSIZE/2),
  ]);

  const grid = new Uint8Array(S * S).fill(WALL);
  const r = makeRng(seed * 31 + 7);
  const STEP = 3;
  const startX = 1 + STEP * Math.floor(((S >> 1) - 1) / STEP);
  const startY = 1 + STEP * Math.floor(((S >> 1) - 1) / STEP);
  const visited = new Uint8Array(S * S);
  const stack = [[startX, startY]];
  visited[startY * S + startX] = 1;

  function openBlock(x, y) {
    for (let dy = 0; dy < STEP - 1; dy++)
      for (let dx = 0; dx < STEP - 1; dx++) {
        const cx = x+dx, cy = y+dy;
        if (cx > 0 && cy > 0 && cx < S-1 && cy < S-1) grid[cy*S+cx] = 0;
      }
  }
  openBlock(startX, startY);

  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nbrs = [];
    for (const [ddx,ddy] of [[0,-STEP],[0,STEP],[-STEP,0],[STEP,0]]) {
      const nx = cx+ddx, ny = cy+ddy;
      if (nx < 1 || ny < 1 || nx > S-2 || ny > S-2) continue;
      if (!visited[ny*S+nx]) nbrs.push([nx,ny,ddx,ddy]);
    }
    if (!nbrs.length) { stack.pop(); continue; }
    const [nx,ny,ddx,ddy] = nbrs[Math.floor(r() * nbrs.length)];
    visited[ny*S+nx] = 1;
    for (let s = 1; s < STEP; s++) {
      const mx = cx + Math.round(ddx*s/STEP), my = cy + Math.round(ddy*s/STEP);
      for (let dy = 0; dy < STEP-1; dy++)
        for (let dx2 = 0; dx2 < STEP-1; dx2++) {
          const fx = mx+dx2, fy = my+dy;
          if (fx > 0 && fy > 0 && fx < S-1 && fy < S-1) grid[fy*S+fx] = 0;
        }
    }
    openBlock(nx, ny);
    stack.push([nx, ny]);
  }

  // Extra openings
  const extra = Math.floor(S * 1.5);
  for (let i = 0; i < extra; i++) {
    const x = 1+Math.floor(r()*(S-2)), y = 1+Math.floor(r()*(S-2));
    if (grid[y*S+x] !== WALL) continue;
    const h = grid[y*S+x-1]===0 || grid[y*S+x+1]===0;
    const v = grid[(y-1)*S+x]===0 || grid[(y+1)*S+x]===0;
    if (h || v) grid[y*S+x] = 0;
  }

  // Border
  for (let x = 0; x < S; x++) { grid[x] = WALL; grid[(S-1)*S+x] = WALL; }
  for (let y = 0; y < S; y++) { grid[y*S] = WALL; grid[y*S+S-1] = WALL; }

  // Corridor from each spawn to centre
  const midX = Math.floor(S/2), midY = Math.floor(S/2);
  for (let i = 0; i < active.length; i++) {
    const [cx2, cy2] = corners[i%4];
    for (let dy = 0; dy < TSIZE; dy++)
      for (let dx = 0; dx < TSIZE; dx++) {
        const x = cx2+dx, y = cy2+dy;
        if (x > 0 && y > 0 && x < S-1 && y < S-1) grid[y*S+x] = 0;
      }
    let [px, py] = spawns[i];
    while (px !== midX || py !== midY) {
      if (px > 0 && px < S-1 && py > 0 && py < S-1) grid[py*S+px] = 0;
      if (px < midX) px++; else if (px > midX) px--;
      if (py < midY) py++; else if (py > midY) py--;
    }
  }

  // Connectivity flood-fill from spawn[0]
  {
    const [s0x, s0y] = spawns[0];
    const reached = new Uint8Array(S*S);
    const q = [s0y*S+s0x]; reached[s0y*S+s0x] = 1;
    let qi = 0;
    while (qi < q.length) {
      const idx = q[qi++];
      const rx = idx%S, ry = Math.floor(idx/S);
      for (const [ddx,ddy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = rx+ddx, ny = ry+ddy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        const ni = ny*S+nx;
        if (!reached[ni] && grid[ni] !== WALL) { reached[ni] = 1; q.push(ni); }
      }
    }
    for (let i = 0; i < S*S; i++) if (grid[i] !== WALL && !reached[i]) grid[i] = WALL;
  }

  // Stamp territories
  active.forEach((p, i) => {
    const [cx2, cy2] = corners[i%4];
    for (let dy = 0; dy < TSIZE; dy++)
      for (let dx = 0; dx < TSIZE; dx++) {
        const x = cx2+dx, y = cy2+dy;
        if (x > 0 && y > 0 && x < S-1 && y < S-1) grid[y*S+x] = 10+p;
      }
  });
  for (let x = 0; x < S; x++) { grid[x] = WALL; grid[(S-1)*S+x] = WALL; }
  for (let y = 0; y < S; y++) { grid[y*S] = WALL; grid[y*S+S-1] = WALL; }

  const players = active.map((p, i) => {
    const [sx, sy] = spawns[i];
    let score = 0;
    for (let j = 0; j < grid.length; j++) if (grid[j] === 10+p) score++;
    return { idx: p, x: sx, y: sy, dx: 0, dy: 0, pendingDx: 0, pendingDy: 0,
             trail: [], trailSet: new Set(), alive: true, onOwn: true,
             score, aiTimer: 0 };
  });

  return {
    S, grid, players, active,
    dead: [], winner: null, winReason: '',
    dominantPlayer: -1, dominationStart: 0, dominationElapsed: 0,
  };
}

// ─── GAME LOGIC (pure mutations on G ref) ────────────────────────────────────
function stepGame(G, playerTypes, playerDiffs) {
  if (!G || G.winner) return;
  const { S, grid, players } = G;

  for (const pl of players) {
    if (!pl.alive) continue;

    if (playerTypes[pl.idx] === 'human') {
      if (pl.pendingDx !== 0 || pl.pendingDy !== 0) {
        pl.dx = pl.pendingDx; pl.dy = pl.pendingDy;
        pl.pendingDx = 0; pl.pendingDy = 0;
      }
      if (pl.dx === 0 && pl.dy === 0) continue;
    } else {
      aiDecide(pl, G, playerDiffs[pl.idx]);
    }

    const nx = pl.x + pl.dx, ny = pl.y + pl.dy;
    if (grid[ny*S+nx] === WALL) { bounceOrStop(pl, G); continue; }

    const prevCell = grid[pl.y*S+pl.x];
    const destCell = grid[ny*S+nx];
    const onOwnNow = destCell === 10+pl.idx;
    if (prevCell === 10+pl.idx && !onOwnNow) pl.onOwn = false;

    if (!pl.onOwn) {
      const key = pl.x+','+pl.y;
      if (!pl.trailSet.has(key)) {
        pl.trail.push({ x: pl.x, y: pl.y });
        pl.trailSet.add(key);
        grid[pl.y*S+pl.x] = 20+pl.idx;
      } else {
        for (const {x,y} of pl.trail) if (G.grid[y*G.S+x] === 20+pl.idx) G.grid[y*G.S+x] = 0;
        pl.trail = []; pl.trailSet.clear();
        pl.dx = -pl.dx; pl.dy = -pl.dy;
        pl.onOwn = false;
        continue;
      }
    }

    pl.x = nx; pl.y = ny;

    if (!pl.onOwn && grid[ny*S+nx] === 20+pl.idx) {
      grid[ny*S+nx] = 0;
      pl.trail.pop();
      pl.trailSet.delete(nx+','+ny);
    }

    const curCell = grid[ny*S+nx];
    if (curCell === 10+pl.idx && !pl.onOwn && pl.trail.length > 0) {
      claimArea(pl, G);
      pl.trail = []; pl.trailSet.clear(); pl.onOwn = true;
    } else if (curCell === 10+pl.idx) {
      pl.onOwn = true; pl.trail = []; pl.trailSet.clear();
    } else {
      pl.onOwn = false;
    }
  }

  checkTrailCuts(G);
  if (!checkWinner(G)) checkDomination(G);
}

function bounceOrStop(pl, G) {
  const { S, grid } = G;
  const perps = pl.dx !== 0 ? [[0,-1],[0,1]] : [[-1,0],[1,0]];
  for (const [tdx,tdy] of perps) {
    const nx = pl.x+tdx, ny = pl.y+tdy;
    if (nx > 0 && nx < S-1 && ny > 0 && ny < S-1 && grid[ny*S+nx] !== WALL) {
      pl.dx = tdx; pl.dy = tdy; return;
    }
  }
  pl.dx = 0; pl.dy = 0;
}

function checkTrailCuts(G) {
  for (const pl of G.players) {
    if (!pl.alive || pl.onOwn) continue;
    for (const other of G.players) {
      if (!other.alive || other.idx === pl.idx) continue;
      if (pl.trailSet.has(other.x+','+other.y)) { killPlayer(pl, G); break; }
    }
  }
}

function killPlayer(pl, G) {
  pl.alive = false;
  for (const {x,y} of pl.trail) if (G.grid[y*G.S+x] === 20+pl.idx) G.grid[y*G.S+x] = 0;
  pl.trail = []; pl.trailSet.clear();
  G.dead.push(pl.idx);
  if (G.dominantPlayer === pl.idx) {
    G.dominantPlayer = -1; G.dominationStart = 0; G.dominationElapsed = 0;
  }
}

function checkWinner(G) {
  const alive = G.players.filter(p => p.alive);
  if (alive.length <= 1) {
    G.winner = alive.length === 1 ? alive[0] : null;
    G.winReason = 'last-survivor';
    return true;
  }
  return false;
}

function checkDomination(G) {
  let playable = 0;
  for (let i = 0; i < G.grid.length; i++) if (G.grid[i] !== WALL) playable++;
  const half = playable * 0.5;
  const now = Date.now();
  let dominant = null;
  for (const pl of G.players) if (pl.alive && pl.score > half) { dominant = pl; break; }
  if (dominant) {
    if (G.dominantPlayer !== dominant.idx) {
      G.dominantPlayer = dominant.idx; G.dominationStart = now; G.dominationElapsed = 0;
    } else {
      G.dominationElapsed = now - G.dominationStart;
      if (G.dominationElapsed >= DOMINATION_MS) {
        G.winner = dominant; G.winReason = 'domination';
      }
    }
  } else {
    G.dominantPlayer = -1; G.dominationStart = 0; G.dominationElapsed = 0;
  }
}

function claimArea(pl, G) {
  const { S, grid, players } = G;
  const p = pl.idx;
  for (const {x,y} of pl.trail) grid[y*S+x] = 10+p;
  const total = S*S;
  const visited = new Uint8Array(total);
  const queue = [];
  const isOwn = v => v === 10+p;
  for (let x = 0; x < S; x++) {
    for (const y of [0, S-1]) { const i = y*S+x; if (!isOwn(grid[i]) && !visited[i]) { visited[i]=1; queue.push(i); } }
  }
  for (let y = 1; y < S-1; y++) {
    for (const x of [0, S-1]) { const i = y*S+x; if (!isOwn(grid[i]) && !visited[i]) { visited[i]=1; queue.push(i); } }
  }
  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const x = idx%S, y = Math.floor(idx/S);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, ny = y+dy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const ni = ny*S+nx;
      if (!visited[ni] && !isOwn(grid[ni])) { visited[ni]=1; queue.push(ni); }
    }
  }
  for (let i = 0; i < total; i++) {
    if (visited[i] || isOwn(grid[i]) || grid[i] === WALL) continue;
    const prev = grid[i];
    grid[i] = 10+p;
    if (prev >= 10 && prev < 20 && prev !== 10+p) {
      const epl = players.find(pl2 => pl2.idx === prev-10);
      if (epl) epl.score--;
    }
  }
  for (const pl2 of players) {
    let s = 0;
    for (let i = 0; i < total; i++) if (grid[i] === 10+pl2.idx) s++;
    pl2.score = s;
  }
}

// ─── AI ──────────────────────────────────────────────────────────────────────
function aiDecide(pl, G, diff) {
  pl.aiTimer--;
  if (pl.aiTimer > 0) return;
  if (pl.dx === 0 && pl.dy === 0) { pl.dx = 1; pl.dy = 0; pl.aiTimer = 1; return; }
  if (diff === 1) {
    pl.aiTimer = 8 + Math.floor(Math.random()*12);
    if (Math.random() < 0.3) randomTurn(pl, G); else if (!canMove(pl, pl.dx, pl.dy, G)) randomTurn(pl, G);
  } else if (diff === 2) {
    pl.aiTimer = 3 + Math.floor(Math.random()*5);
    mediumAI(pl, G);
  } else {
    pl.aiTimer = 1 + Math.floor(Math.random()*2);
    hardAI(pl, G);
  }
}

function canMove(pl, dx, dy, G) {
  const { S, grid } = G;
  const nx = pl.x+dx, ny = pl.y+dy;
  if (nx <= 0 || ny <= 0 || nx >= S-1 || ny >= S-1) return false;
  if (grid[ny*S+nx] === WALL) return false;
  if (pl.trailSet.has(nx+','+ny)) return false;
  return true;
}

function randomTurn(pl, G) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const valid = dirs.filter(([dx,dy]) => canMove(pl,dx,dy,G) && !(dx===-pl.dx&&dy===-pl.dy));
  if (valid.length) { const [dx,dy] = valid[Math.floor(Math.random()*valid.length)]; pl.dx=dx; pl.dy=dy; }
  else if (canMove(pl, pl.dx, pl.dy, G)) return;
  else { const any = dirs.filter(d => canMove(pl,d[0],d[1],G)); if (any.length) { pl.dx=any[0][0]; pl.dy=any[0][1]; } }
}

function mediumAI(pl, G) {
  const { grid } = G;
  if (!canMove(pl, pl.dx, pl.dy, G)) { randomTurn(pl, G); return; }
  if (pl.onOwn) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let best = null, bestScore = -1;
    for (const [dx,dy] of dirs) {
      if (dx===-pl.dx&&dy===-pl.dy) continue;
      if (!canMove(pl,dx,dy,G)) continue;
      const nx = pl.x+dx, ny = pl.y+dy;
      const cell = grid[ny*G.S+nx];
      let score = cell===0?10:(cell>=10&&cell<20&&cell!==10+pl.idx)?8:1;
      if (score > bestScore) { bestScore=score; best=[dx,dy]; }
    }
    if (best) { pl.dx=best[0]; pl.dy=best[1]; } else randomTurn(pl, G);
  } else {
    if (!canMove(pl, pl.dx, pl.dy, G)) randomTurn(pl, G);
  }
}

function hardAI(pl, G) {
  const { S, grid, players } = G;
  if (!canMove(pl, pl.dx, pl.dy, G)) { randomTurn(pl, G); return; }
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  if (pl.onOwn) {
    let best = null, bestScore = -Infinity;
    for (const [dx,dy] of dirs) {
      if (dx===-pl.dx&&dy===-pl.dy&&(pl.dx!==0||pl.dy!==0)) continue;
      if (!canMove(pl,dx,dy,G)) continue;
      const nx = pl.x+dx, ny = pl.y+dy;
      const cell = grid[ny*S+nx];
      let score = cell===0?20+Math.random()*5:(cell>=10&&cell<20&&cell!==10+pl.idx)?15+Math.random()*5:0;
      score += Math.abs(nx-S/2)*0.1 + Math.abs(ny-S/2)*0.1;
      for (const op of players) {
        if (!op.alive || op.idx===pl.idx) continue;
        if (!op.onOwn) { const dist = Math.abs(op.x-nx)+Math.abs(op.y-ny); if (dist<5) score -= (5-dist)*3; }
      }
      if (score > bestScore) { bestScore=score; best=[dx,dy]; }
    }
    if (best) { pl.dx=best[0]; pl.dy=best[1]; } else randomTurn(pl, G);
  } else {
    let threatened = false;
    for (const op of players) {
      if (!op.alive || op.idx===pl.idx) continue;
      for (const {x,y} of pl.trail) { if (Math.abs(op.x-x)+Math.abs(op.y-y)<4) { threatened=true; break; } }
      if (threatened) break;
    }
    if (threatened) {
      const homeDir = dirTowardHome(pl, G);
      if (homeDir && canMove(pl,homeDir[0],homeDir[1],G)) { pl.dx=homeDir[0]; pl.dy=homeDir[1]; }
      else if (!canMove(pl,pl.dx,pl.dy,G)) randomTurn(pl, G);
    } else {
      if (!canMove(pl,pl.dx,pl.dy,G)) randomTurn(pl, G);
    }
  }
}

function dirTowardHome(pl, G) {
  const { S, grid } = G;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  let best = null, bestDist = Infinity;
  for (const [dx,dy] of dirs) {
    if (!canMove(pl,dx,dy,G)) continue;
    const nx = pl.x+dx, ny = pl.y+dy;
    let minD = Infinity;
    for (let sy = Math.max(0,pl.y-15); sy < Math.min(S,pl.y+15); sy++)
      for (let sx = Math.max(0,pl.x-15); sx < Math.min(S,pl.x+15); sx++)
        if (grid[sy*S+sx]===10+pl.idx) { const d=Math.abs(sx-nx)+Math.abs(sy-ny); if(d<minD) minD=d; }
    if (minD < bestDist) { bestDist=minD; best=[dx,dy]; }
  }
  return best;
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function drawGame(canvas, G) {
  if (!canvas || !G) return;
  const { S, grid, players } = G;
  const W = S * CELL;
  canvas.width = W; canvas.height = W;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, W, W);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = grid[y*S+x];
      const px = x*CELL, py = y*CELL;
      if (v === WALL) {
        ctx.fillStyle = '#080a0d';
        ctx.fillRect(px, py, CELL, CELL);
      } else if (v === 0) {
        ctx.fillStyle = '#2a3040';
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = '#313b50';
        ctx.fillRect(px+1, py+1, CELL-2, CELL-2);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(px+CELL/2-1, py+CELL/2-1, 2, 2);
      } else if (v >= 10 && v < 20) {
        const p = v-10, rgb = P_RGB[p];
        ctx.fillStyle = `rgba(${rgb},0.45)`;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = `rgba(${rgb},0.15)`;
        ctx.fillRect(px+1, py+1, CELL-2, CELL-2);
      } else if (v >= 20 && v < 30) {
        const p = v-20, rgb = P_RGB[p];
        ctx.fillStyle = `rgba(${rgb},0.3)`;
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = PCOLORS[p];
        ctx.fillRect(px+2, py+2, CELL-4, CELL-4);
      }
    }
  }

  for (const pl of players) {
    if (!pl.alive) continue;
    const px = pl.x*CELL, py = pl.y*CELL;
    const rgb = P_RGB[pl.idx];
    if (pl.onOwn) {
      ctx.fillStyle = `rgba(${rgb},0.4)`;
      ctx.beginPath();
      ctx.arc(px+CELL/2, py+CELL/2, CELL/2-1, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${rgb},0.15)`;
      ctx.beginPath();
      ctx.arc(px+CELL/2, py+CELL/2, CELL, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = PCOLORS[pl.idx];
      ctx.beginPath();
      ctx.arc(px+CELL/2, py+CELL/2, CELL/2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(px+CELL/2-CELL*0.12, py+CELL/2-CELL*0.12, CELL*0.15, 0, Math.PI*2);
      ctx.fill();
    }
  }

  if (G.dominantPlayer >= 0 && G.dominationStart > 0 && !G.winner) {
    const domPl = players.find(p => p.idx===G.dominantPlayer && p.alive);
    if (domPl) {
      const progress = Math.min(1, G.dominationElapsed / DOMINATION_MS);
      const cx2 = domPl.x*CELL+CELL/2, cy2 = domPl.y*CELL+CELL/2;
      const R = CELL * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx2, cy2, R, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = PCOLORS[domPl.idx];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx2, cy2, R, -Math.PI/2, -Math.PI/2 + progress*Math.PI*2);
      ctx.stroke();
    }
  }
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { fontFamily:"'Syne',sans-serif", background:'#0a0c10', color:'#dde2f0',
         minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center',
         overflow:'hidden' },
  // Menu
  menuWrap: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              minHeight:'100vh', padding:'1.5rem', width:'100%' },
  logo: { fontSize:'clamp(3rem,9vw,5.5rem)', fontWeight:800, letterSpacing:'-0.04em',
          background:'linear-gradient(130deg,#4fffb0 0%,#6bcbff 100%)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
          marginBottom:'0.2rem' },
  tagline: { fontSize:'0.72rem', color:'#6b7291', letterSpacing:'0.2em', textTransform:'uppercase',
             marginBottom:'2rem', fontFamily:"'Space Mono',monospace" },
  card: { background:'#12151e', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16,
          padding:'1.25rem', width:'min(480px,100%)', marginBottom:'0.75rem' },
  sLabel: { fontSize:'0.62rem', letterSpacing:'0.2em', textTransform:'uppercase',
            color:'#6b7291', marginBottom:'0.75rem', fontFamily:"'Space Mono',monospace" },
  pRow: { display:'flex', alignItems:'center', gap:10, padding:'7px 0',
          borderBottom:'1px solid rgba(255,255,255,0.07)' },
  pName: { flex:1, fontSize:'0.88rem', fontWeight:700 },
  tog: { display:'flex', gap:3 },
  sRow: { display:'flex', alignItems:'center', gap:10, marginTop:'0.7rem' },
  sVal: { fontFamily:"'Space Mono',monospace", fontSize:'0.78rem', color:'#4fffb0',
          minWidth:28, textAlign:'right' },
  playBtn: { width:'100%', padding:'0.85rem', background:'#4fffb0', color:'#060a08',
             border:'none', borderRadius:12, fontSize:'0.95rem', fontWeight:700,
             fontFamily:"'Syne',sans-serif", cursor:'pointer', letterSpacing:'0.04em',
             marginTop:'1rem' },
  hintText: { fontSize:'0.68rem', color:'#6b7291', lineHeight:1.9,
              fontFamily:"'Space Mono',monospace", textAlign:'center', marginTop:'0.6rem' },
  // Game
  gameWrap: { display:'flex', flexDirection:'column', width:'100%', height:'100vh', overflow:'hidden' },
  hdr: { display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.55rem 1rem',
         background:'#12151e', borderBottom:'1px solid rgba(255,255,255,0.07)',
         flexShrink:0, flexWrap:'wrap' },
  htitle: { fontSize:'0.85rem', fontWeight:700, letterSpacing:'0.08em', color:'#4fffb0' },
  pills: { display:'flex', gap:5, flex:1, flexWrap:'wrap' },
  gbody: { flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem', minHeight:0 },
  // Win
  winWrap: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
             minHeight:'100vh', padding:'2rem', textAlign:'center' },
  winInner: { maxWidth:360 },
  winTitle: { fontSize:'2.6rem', fontWeight:800, marginBottom:'0.4rem' },
  winSub: { fontSize:'0.75rem', color:'#6b7291', fontFamily:"'Space Mono',monospace",
            letterSpacing:'0.1em', marginBottom:'1.75rem' },
  winRows: { display:'flex', flexDirection:'column', gap:7, marginBottom:'1.75rem', width:'100%' },
  winRow: { display:'flex', alignItems:'center', gap:11, background:'#12151e',
            borderRadius:10, padding:'8px 13px', border:'1px solid rgba(255,255,255,0.07)' },
  bPair: { display:'flex', gap:10, width:'100%' },
};

function tbStyle(on) {
  return { padding:'3px 9px', borderRadius:5, cursor:'pointer', fontSize:'0.7rem',
           fontFamily:"'Space Mono',monospace", transition:'all 0.12s',
           background: on ? '#1a1f2e' : 'transparent',
           color: on ? '#dde2f0' : '#6b7291',
           border: on ? '1px solid #4fffb0' : '1px solid rgba(255,255,255,0.14)' };
}
function dselStyle(disabled) {
  return { background:'#1a1f2e', border:'1px solid rgba(255,255,255,0.14)', color:'#dde2f0',
           borderRadius:5, padding:'3px 8px', fontSize:'0.7rem',
           fontFamily:"'Space Mono',monospace", cursor: disabled?'default':'pointer',
           opacity: disabled ? 0.25 : 1 };
}
function pillStyle(color, active, dead) {
  return { display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20,
           fontSize:'0.72rem', fontFamily:"'Space Mono',monospace",
           border: active ? `1px solid ${color}` : '1px solid transparent',
           color, opacity: dead ? 0.3 : 1 };
}
function mbtnStyle() {
  return { padding:'5px 12px', borderRadius:7, border:'1px solid rgba(255,255,255,0.14)',
           background:'transparent', color:'#6b7291', fontSize:'0.72rem', cursor:'pointer',
           fontFamily:"'Space Mono',monospace" };
}
function bmStyle(primary) {
  return { flex:1, padding:'0.7rem', background: primary?'#4fffb0':'transparent',
           color: primary?'#060a08':'#dde2f0',
           border: primary?'none':'1px solid rgba(255,255,255,0.14)',
           borderRadius:10, fontSize:'0.88rem', fontWeight: primary?700:400,
           fontFamily:"'Syne',sans-serif", cursor:'pointer' };
}

// ─── MENU SCREEN ─────────────────────────────────────────────────────────────
function MenuScreen({ cfg, setCfg, onStart }) {
  const setType = (pi, t) => setCfg(c => { const types=[...c.types]; types[pi]=t; return {...c,types}; });
  const setDiff = (pi, v) => setCfg(c => { const diffs=[...c.diffs]; diffs[pi]=+v; return {...c,diffs}; });

  return (
    <div style={S.menuWrap}>
      <div style={S.logo}>Territory</div>
      <div style={S.tagline}>Expand · Trace · Survive</div>

      <div style={S.card}>
        <div style={S.sLabel}>Players</div>
        {[0,1,2,3].map(pi => (
          <div key={pi} style={{...S.pRow, borderBottom: pi===3?'none':undefined}}>
            <div style={{width:11,height:11,borderRadius:'50%',background:PCOLORS[pi],flexShrink:0}}/>
            <div style={{...S.pName, color:PCOLORS[pi]}}>{PNAMES[pi]}</div>
            <div style={S.tog}>
              {['human','ai', pi>=2?'off':null].filter(Boolean).map(t => (
                <button key={t} style={tbStyle(cfg.types[pi]===t)} onClick={() => setType(pi,t)}>
                  {t==='off'?'Off':t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
            <select style={dselStyle(cfg.types[pi]!=='ai')} disabled={cfg.types[pi]!=='ai'}
              value={cfg.diffs[pi]} onChange={e => setDiff(pi, e.target.value)}>
              <option value={1}>Easy</option>
              <option value={2}>Medium</option>
              <option value={3}>Hard</option>
            </select>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={S.sLabel}>Board</div>
        {[
          ['Board size', 'size', 40, 100],
          ['Game speed', 'speed', 1, 5],
          ['Level seed', 'seed', 1, 99],
        ].map(([label, key, min, max]) => (
          <div key={key} style={S.sRow}>
            <label style={{flex:1, fontSize:'0.86rem'}}>{label}</label>
            <input type="range" min={min} max={max} value={cfg[key]}
              style={{flex:1, accentColor:'#4fffb0'}}
              onChange={e => setCfg(c => ({...c, [key]: +e.target.value}))} />
            <span style={S.sVal}>{cfg[key]}</span>
          </div>
        ))}
      </div>

      <button style={S.playBtn} onClick={onStart}>Start Game →</button>
      <div style={S.hintText}>
        P1: Arrow keys &nbsp;|&nbsp; P2: WASD &nbsp;|&nbsp; P3: IJKL &nbsp;|&nbsp; P4: Numpad<br/>
        R — restart &nbsp;|&nbsp; M — menu &nbsp;|&nbsp; Space — pause
      </div>
    </div>
  );
}

// ─── WIN SCREEN ──────────────────────────────────────────────────────────────
function WinScreen({ G, cfg, onAgain, onMenu }) {
  if (!G) return null;
  const { grid, players, winner, winReason } = G;
  let playable = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] !== WALL) playable++;
  const w = winner || players.reduce((a,b) => a.score>b.score?a:b);
  const isHuman = cfg.types[w.idx] === 'human';
  const isDom = winReason === 'domination';
  const ranked = [...players].sort((a,b) => (a.alive===b.alive)?(b.score-a.score):a.alive?-1:1);

  return (
    <div style={S.winWrap}>
      <div style={S.winInner}>
        <div style={{fontSize:'3.2rem',marginBottom:'0.6rem'}}>{isDom?'👑':isHuman?'🏆':'🤖'}</div>
        <div style={{...S.winTitle, color: PCOLORS[w.idx]}}>
          {isHuman ? 'Victory!' : PNAMES[w.idx]+' Wins!'}
        </div>
        <div style={S.winSub}>
          {isDom ? '50% DOMINATION — 30 SECONDS HELD' : isHuman ? 'LAST PLAYER STANDING' : 'BETTER LUCK NEXT TIME'}
        </div>
        <div style={S.winRows}>
          {ranked.map(pl => {
            const pct = playable ? Math.round(pl.score/playable*100) : 0;
            const isW = pl.idx === w.idx;
            return (
              <div key={pl.idx} style={{...S.winRow, borderColor: isW?PCOLORS[pl.idx]+'60':undefined}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:PCOLORS[pl.idx]}}/>
                <span style={{flex:1,fontWeight:700,fontSize:'0.88rem',color:isW?PCOLORS[pl.idx]:undefined}}>
                  {PNAMES[pl.idx]}{isW?' ★':''}
                </span>
                <span style={{fontSize:'0.68rem',color:'#6b7291',fontFamily:"'Space Mono',monospace",marginRight:8}}>
                  {pl.alive?'alive':'eliminated'}
                </span>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:'0.83rem',color:'#4fffb0'}}>{pct}%</span>
              </div>
            );
          })}
        </div>
        <div style={S.bPair}>
          <button style={bmStyle(true)} onClick={onAgain}>Play Again</button>
          <button style={bmStyle(false)} onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

// ─── GAME SCREEN ─────────────────────────────────────────────────────────────
function GameScreen({ cfg, onMenu, onWin, initialG }) {
  const canvasRef = useRef(null);
  const gRef = useRef(initialG);          // mutable game state — not React state
  const pausedRef = useRef(false);
  const lastTimeRef = useRef(0);
  const animIdRef = useRef(null);
  const flashTimerRef = useRef(null);
  const [hudTick, setHudTick] = useState(0); // trigger re-render for HUD
  const [paused, setPaused] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');
  const flashShowRef = useRef(false);

  const flash = useCallback((msg) => {
    setFlashMsg(msg);
    flashShowRef.current = true;
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => { flashShowRef.current = false; setFlashMsg(''); }, 2000);
  }, []);

  // Override killPlayer to also flash
  const killRef = useRef(flash);
  killRef.current = flash;

  const loop = useCallback((ts) => {
    animIdRef.current = requestAnimationFrame(loop);
    if (pausedRef.current || !gRef.current) return;
    const dt = ts - lastTimeRef.current;
    if (dt < SPEEDS[cfg.speed]) return;
    lastTimeRef.current = ts;

    const G = gRef.current;
    const prevDead = G.dead.length;
    stepGame(G, cfg.types, cfg.diffs);

    // Flash new eliminations
    if (G.dead.length > prevDead) {
      const newDead = G.dead.slice(prevDead);
      newDead.forEach(idx => killRef.current(PNAMES[idx]+' eliminated!'));
    }

    drawGame(canvasRef.current, G);
    setHudTick(t => t+1); // re-render HUD

    if (G.winner) {
      cancelAnimationFrame(animIdRef.current);
      setTimeout(() => onWin(G), 500);
    }
  }, [cfg, onWin]);

  useEffect(() => {
    gRef.current = initialG;
    lastTimeRef.current = 0;
    pausedRef.current = false;
    setPaused(false);
    cancelAnimationFrame(animIdRef.current);
    animIdRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animIdRef.current);
  }, [initialG, loop]);

  // Resize canvas
  useEffect(() => {
    const G = gRef.current;
    if (!canvasRef.current || !G) return;
    const maxW = window.innerWidth - 32;
    const maxH = window.innerHeight - 80;
    const scale = Math.min(maxW/(G.S*CELL), maxH/(G.S*CELL));
    canvasRef.current.style.width = Math.floor(G.S*CELL*scale)+'px';
    canvasRef.current.style.height = Math.floor(G.S*CELL*scale)+'px';
  }, [hudTick]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        if (!pausedRef.current) lastTimeRef.current = 0;
        return;
      }
      if (e.key === 'm' || e.key === 'M') { cancelAnimationFrame(animIdRef.current); onMenu(); return; }
      if (e.key === 'r' || e.key === 'R') { /* handled by parent */ return; }
      const dir = DIRMAP[e.key];
      if (!dir || !gRef.current) return;
      for (let ki = 0; ki < 4; ki++) {
        if (!PKEYS[ki].has(e.key)) continue;
        if (cfg.types[ki] !== 'human') continue;
        const pl = gRef.current.players.find(p => p.idx===ki && p.alive);
        if (pl) { e.preventDefault(); pl.pendingDx=dir[0]; pl.pendingDy=dir[1]; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cfg, onMenu]);

  // HUD data
  const G = gRef.current;
  let playable = 0;
  if (G) for (let i = 0; i < G.grid.length; i++) if (G.grid[i] !== WALL) playable++;

  return (
    <div style={S.gameWrap}>
      <div style={S.hdr}>
        <div style={S.htitle}>TERRITORY</div>
        <div style={S.pills}>
          {G && G.players.map(pl => {
            const pct = playable ? Math.round(pl.score/playable*100) : 0;
            const isActive = pl.alive && !pl.onOwn;
            const isDom = G.dominantPlayer === pl.idx && G.dominationStart > 0;
            const remaining = isDom ? Math.ceil((DOMINATION_MS - G.dominationElapsed)/1000) : 0;
            return (
              <div key={pl.idx} style={pillStyle(PCOLORS[pl.idx], isActive, !pl.alive)}>
                <div style={{width:7,height:7,borderRadius:'50%',background:PCOLORS[pl.idx]}}/>
                <span>{PNAMES[pl.idx]}</span>
                <span style={{fontWeight:700,marginLeft:2}}>{pct}%</span>
                {!pl.alive && <span style={{fontSize:'0.62rem',opacity:0.7}}> ✕</span>}
                {isDom && <span style={{fontSize:'0.62rem',marginLeft:3,background:'rgba(255,255,255,0.12)',
                  borderRadius:4,padding:'1px 5px'}}>⚡{remaining}s</span>}
              </div>
            );
          })}
        </div>
        <button style={mbtnStyle()} onClick={() => {
          pausedRef.current = !pausedRef.current;
          setPaused(pausedRef.current);
          if (!pausedRef.current) lastTimeRef.current = 0;
        }}>{paused ? 'Resume' : 'Pause'}</button>
        <button style={mbtnStyle()} onClick={() => { cancelAnimationFrame(animIdRef.current); onMenu(); }}>← Menu</button>
      </div>
      <div style={S.gbody}>
        <canvas ref={canvasRef} style={{display:'block',borderRadius:6,border:'1px solid rgba(255,255,255,0.07)',imageRendering:'pixelated'}}/>
      </div>
      {flashMsg && (
        <div style={{position:'fixed',top:'0.8rem',left:'50%',transform:'translateX(-50%)',
          background:'#12151e',border:'1px solid rgba(255,255,255,0.14)',borderRadius:8,
          padding:'6px 18px',fontSize:'0.78rem',fontFamily:"'Space Mono',monospace",zIndex:99,
          pointerEvents:'none'}}>
          {flashMsg}
        </div>
      )}
      {paused && (
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          background:'rgba(10,12,16,0.92)',border:'1px solid rgba(255,255,255,0.14)',borderRadius:12,
          padding:'1.5rem 2.5rem',textAlign:'center',fontSize:'1.2rem',fontWeight:700,letterSpacing:'0.1em',
          color:'#4fffb0'}}>
          PAUSED
        </div>
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('menu'); // 'menu' | 'game' | 'win'
  const [cfg, setCfg] = useState({
    types: ['human','ai','off','off'],
    diffs: [2,2,2,2],
    size: 60, speed: 2, seed: 1,
  });
  const [gameState, setGameState] = useState(null);
  const [winState, setWinState] = useState(null);

  const startGame = useCallback((overrideCfg) => {
    const c = overrideCfg || cfg;
    const active = c.types.filter(t => t !== 'off');
    if (active.length < 2) { alert('Need at least 2 players!'); return; }
    const G = generateGame(c);
    setGameState(G);
    setWinState(null);
    setScreen('game');
  }, [cfg]);

  const handleWin = useCallback((G) => {
    setWinState(G);
    setScreen('win');
  }, []);

  const handleAgain = useCallback(() => {
    setCfg(c => {
      const next = {...c, seed: (c.seed % 99) + 1};
      startGame(next);
      return next;
    });
  }, [startGame]);

  if (screen === 'menu') return (
    <div style={S.app}>
      <MenuScreen cfg={cfg} setCfg={setCfg} onStart={() => startGame()} />
    </div>
  );

  if (screen === 'win') return (
    <div style={S.app}>
      <WinScreen G={winState} cfg={cfg} onAgain={handleAgain} onMenu={() => setScreen('menu')} />
    </div>
  );

  return (
    <div style={S.app}>
      <GameScreen key={gameState?.S + '-' + gameState?.players?.length + '-' + cfg.seed}
        cfg={cfg} initialG={gameState} onMenu={() => setScreen('menu')} onWin={handleWin} />
    </div>
  );
}
