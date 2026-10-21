const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const playerHealthEl = document.querySelector("#player-health");
const opponentHealthEl = document.querySelector("#opponent-health");
const scoreEl = document.querySelector("#score");
const messageEl = document.querySelector("#message");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");

const keys = new Set();
const arena = {
  size: 34,
  half: 17,
};

const state = {
  running: false,
  ended: false,
  score: 0,
  lastTime: 0,
  muzzleFlash: 0,
  hitFlash: 0,
  shotCooldown: 0,
  opponentCooldown: 0,
  player: {
    x: 0,
    z: 10,
    angle: Math.PI,
    health: 100,
  },
  opponent: {
    x: 0,
    z: -8,
    health: 100,
    strafe: 1,
    nextStrafe: 0,
  },
  particles: [],
};

const walls = [
  segment(-arena.half, -arena.half, arena.half, -arena.half),
  segment(arena.half, -arena.half, arena.half, arena.half),
  segment(arena.half, arena.half, -arena.half, arena.half),
  segment(-arena.half, arena.half, -arena.half, -arena.half),
];

const pillars = [
  { x: -8, z: -7, radius: 1.6, color: "#49f2ff" },
  { x: 8, z: -7, radius: 1.6, color: "#ff4f70" },
  { x: -8, z: 6, radius: 1.6, color: "#ffd166" },
  { x: 8, z: 6, radius: 1.6, color: "#9d7dff" },
];

function segment(x1, z1, x2, z2) {
  return { a: { x: x1, z: z1 }, b: { x: x2, z: z2 } };
}

function resetGame() {
  state.running = false;
  state.ended = false;
  state.score = 0;
  state.lastTime = 0;
  state.muzzleFlash = 0;
  state.hitFlash = 0;
  state.shotCooldown = 0;
  state.opponentCooldown = 0;
  state.player = { x: 0, z: 10, angle: Math.PI, health: 100 };
  state.opponent = { x: 0, z: -8, health: 100, strafe: 1, nextStrafe: 0 };
  state.particles = [];
  updateHud();
  showMessage("Arena One", "Click Start, then use arrow keys and space bar.", "Start Game");
  drawScene();
}

function startGame() {
  state.running = true;
  state.ended = false;
  state.lastTime = performance.now();
  messageEl.classList.add("hidden");
  canvas.focus();
  requestAnimationFrame(loop);
}

function showMessage(title, body, buttonText) {
  messageEl.innerHTML = `
    <strong>${title}</strong>
    <span>${body}</span>
    <button id="start-button" type="button">${buttonText}</button>
  `;
  messageEl.classList.remove("hidden");
  messageEl.querySelector("button").addEventListener("click", () => {
    if (state.ended) {
      resetGame();
    }
    startGame();
  });
}

function updateHud() {
  playerHealthEl.textContent = Math.max(0, Math.ceil(state.player.health));
  opponentHealthEl.textContent = Math.max(0, Math.ceil(state.opponent.health));
  scoreEl.textContent = state.score;
}

function loop(time) {
  if (!state.running) {
    return;
  }

  const dt = Math.min((time - state.lastTime) / 1000, 0.04);
  state.lastTime = time;

  update(dt);
  drawScene();

  if (state.running) {
    requestAnimationFrame(loop);
  }
}

function update(dt) {
  const player = state.player;
  const opponent = state.opponent;
  const moveSpeed = 10;
  const turnSpeed = 2.7;

  if (keys.has("ArrowLeft")) {
    player.angle -= turnSpeed * dt;
  }
  if (keys.has("ArrowRight")) {
    player.angle += turnSpeed * dt;
  }

  let move = 0;
  if (keys.has("ArrowUp")) {
    move += 1;
  }
  if (keys.has("ArrowDown")) {
    move -= 0.65;
  }

  if (move !== 0) {
    const nextX = player.x + Math.sin(player.angle) * move * moveSpeed * dt;
    const nextZ = player.z + Math.cos(player.angle) * move * moveSpeed * dt;
    moveEntity(player, nextX, nextZ, 0.8);
  }

  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  state.opponentCooldown = Math.max(0, state.opponentCooldown - dt);
  state.muzzleFlash = Math.max(0, state.muzzleFlash - dt * 5);
  state.hitFlash = Math.max(0, state.hitFlash - dt * 4);

  updateOpponent(dt);
  updateParticles(dt);
  updateHud();

  if (player.health <= 0) {
    endGame(false);
  } else if (opponent.health <= 0) {
    state.score += 1;
    endGame(true);
  }
}

function moveEntity(entity, nextX, nextZ, radius) {
  const clampedX = clamp(nextX, -arena.half + radius, arena.half - radius);
  const clampedZ = clamp(nextZ, -arena.half + radius, arena.half - radius);
  const blocked = pillars.some((pillar) => distance(clampedX, clampedZ, pillar.x, pillar.z) < radius + pillar.radius);

  if (!blocked) {
    entity.x = clampedX;
    entity.z = clampedZ;
  }
}

function updateOpponent(dt) {
  const player = state.player;
  const opponent = state.opponent;
  const dx = player.x - opponent.x;
  const dz = player.z - opponent.z;
  const dist = Math.hypot(dx, dz) || 1;
  const chaseX = dx / dist;
  const chaseZ = dz / dist;
  const strafeX = chaseZ * opponent.strafe;
  const strafeZ = -chaseX * opponent.strafe;

  opponent.nextStrafe -= dt;
  if (opponent.nextStrafe <= 0) {
    opponent.strafe *= -1;
    opponent.nextStrafe = 1.1 + Math.random() * 1.4;
  }

  const keepDistance = dist > 9 ? 1 : dist < 6 ? -0.5 : 0.15;
  const speed = 4.1;
  const nextX = opponent.x + (chaseX * keepDistance + strafeX * 0.8) * speed * dt;
  const nextZ = opponent.z + (chaseZ * keepDistance + strafeZ * 0.8) * speed * dt;
  moveEntity(opponent, nextX, nextZ, 0.9);

  const facingPlayer = Math.atan2(player.x - opponent.x, player.z - opponent.z);
  const playerInSight = Math.abs(wrapAngle(facingPlayer - state.player.angle + Math.PI)) < 1.25;
  if (dist < 18 && state.opponentCooldown <= 0 && hasLineOfSight(opponent, player)) {
    state.opponentCooldown = 1.25 + Math.random() * 0.85;
    spawnImpact(player.x, player.z, "#ff4f70");
    state.player.health -= playerInSight ? 5 : 7;
    state.hitFlash = 1;
  }
}

function shoot() {
  if (!state.running || state.shotCooldown > 0) {
    return;
  }

  state.shotCooldown = 0.34;
  state.muzzleFlash = 1;

  const player = state.player;
  const opponent = state.opponent;
  const dx = opponent.x - player.x;
  const dz = opponent.z - player.z;
  const dist = Math.hypot(dx, dz);
  const targetAngle = Math.atan2(dx, dz);
  const aimError = Math.abs(wrapAngle(targetAngle - player.angle));

  if (aimError < 0.12 && dist < 24 && hasLineOfSight(player, opponent)) {
    const damage = dist < 10 ? 28 : 20;
    opponent.health -= damage;
    spawnImpact(opponent.x, opponent.z, "#49f2ff");
  }
}

function hasLineOfSight(from, to) {
  return !pillars.some((pillar) => distanceToSegment(pillar, from, to) < pillar.radius + 0.15);
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky();
  drawFloor();

  const renderables = [
    ...walls.flatMap((wall) => wallToRenderables(wall)),
    ...pillars.map((pillar) => pillarToRenderable(pillar)),
    opponentToRenderable(),
    ...state.particles.map((particle) => particleToRenderable(particle)),
  ]
    .filter(Boolean)
    .sort((a, b) => b.depth - a.depth);

  for (const item of renderables) {
    item.draw();
  }

  drawCrosshair();
  drawWeapon();
  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 79, 112, ${state.hitFlash * 0.2})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.55);
  gradient.addColorStop(0, "#101b3d");
  gradient.addColorStop(1, "#30204d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.52);

  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 127) % canvas.width;
    const y = (i * 61) % (canvas.height * 0.45);
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawFloor() {
  const horizon = canvas.height * 0.52;
  const gradient = ctx.createLinearGradient(0, horizon, 0, canvas.height);
  gradient.addColorStop(0, "#1a1840");
  gradient.addColorStop(1, "#060914");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

  ctx.strokeStyle = "rgba(73, 242, 255, 0.18)";
  ctx.lineWidth = 1;
  for (let z = -arena.half; z <= arena.half; z += 4) {
    drawWorldLine(-arena.half, z, arena.half, z);
  }
  for (let x = -arena.half; x <= arena.half; x += 4) {
    drawWorldLine(x, -arena.half, x, arena.half);
  }
}

function wallToRenderables(wall) {
  const steps = 9;
  const pieces = [];
  for (let i = 0; i < steps; i += 1) {
    const t1 = i / steps;
    const t2 = (i + 1) / steps;
    const x1 = lerp(wall.a.x, wall.b.x, t1);
    const z1 = lerp(wall.a.z, wall.b.z, t1);
    const x2 = lerp(wall.a.x, wall.b.x, t2);
    const z2 = lerp(wall.a.z, wall.b.z, t2);
    const p1 = project(x1, z1, 0);
    const p2 = project(x2, z2, 0);
    const p3 = project(x2, z2, 4);
    const p4 = project(x1, z1, 4);
    if (!p1 || !p2 || !p3 || !p4) {
      continue;
    }

    const depth = (p1.depth + p2.depth) / 2;
    pieces.push({
      depth,
      draw() {
        ctx.fillStyle = `rgba(48, 80, 155, ${clamp(1 - depth / 45, 0.22, 0.75)})`;
        ctx.strokeStyle = "rgba(73, 242, 255, 0.34)";
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      },
    });
  }
  return pieces;
}

function pillarToRenderable(pillar) {
  const base = project(pillar.x, pillar.z, 0);
  const top = project(pillar.x, pillar.z, 5);
  if (!base || !top) {
    return null;
  }

  const width = 460 / base.depth;
  return {
    depth: base.depth,
    draw() {
      const gradient = ctx.createLinearGradient(base.x - width, top.y, base.x + width, base.y);
      gradient.addColorStop(0, "rgba(255,255,255,0.08)");
      gradient.addColorStop(0.5, pillar.color);
      gradient.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = gradient;
      ctx.fillRect(base.x - width / 2, top.y, width, base.y - top.y);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.strokeRect(base.x - width / 2, top.y, width, base.y - top.y);
    },
  };
}

function opponentToRenderable() {
  if (state.opponent.health <= 0) {
    return null;
  }

  const base = project(state.opponent.x, state.opponent.z, 0);
  const head = project(state.opponent.x, state.opponent.z, 3.2);
  if (!base || !head) {
    return null;
  }

  const height = base.y - head.y;
  const width = Math.max(16, height * 0.46);
  return {
    depth: base.depth,
    draw() {
      const x = base.x;
      const top = head.y;
      const bottom = base.y;
      const torsoTop = top + height * 0.32;
      const torsoBottom = bottom - height * 0.08;
      const glow = Math.sin(performance.now() / 150) * 0.2 + 0.8;

      ctx.save();
      ctx.shadowColor = "#ff123f";
      ctx.shadowBlur = 24 * glow;

      ctx.fillStyle = "rgba(40, 0, 18, 0.78)";
      ctx.beginPath();
      ctx.moveTo(x - width * 0.9, torsoTop);
      ctx.lineTo(x - width * 1.35, bottom);
      ctx.lineTo(x + width * 1.35, bottom);
      ctx.lineTo(x + width * 0.9, torsoTop);
      ctx.closePath();
      ctx.fill();

      const armor = ctx.createLinearGradient(x - width, top, x + width, bottom);
      armor.addColorStop(0, "#3a0d25");
      armor.addColorStop(0.5, "#0a0d1f");
      armor.addColorStop(1, "#050509");
      ctx.fillStyle = armor;
      ctx.beginPath();
      ctx.moveTo(x, torsoTop - height * 0.08);
      ctx.lineTo(x - width * 0.68, torsoTop);
      ctx.lineTo(x - width * 0.42, torsoBottom);
      ctx.lineTo(x + width * 0.42, torsoBottom);
      ctx.lineTo(x + width * 0.68, torsoTop);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 18, 63, 0.9)";
      ctx.lineWidth = Math.max(2, width * 0.06);
      ctx.beginPath();
      ctx.moveTo(x, torsoTop);
      ctx.lineTo(x, torsoBottom);
      ctx.moveTo(x - width * 0.42, torsoTop + height * 0.18);
      ctx.lineTo(x + width * 0.42, torsoTop + height * 0.18);
      ctx.stroke();

      ctx.fillStyle = "#15111f";
      ctx.beginPath();
      ctx.ellipse(x, top + height * 0.19, width * 0.48, height * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#0a0610";
      ctx.beginPath();
      ctx.moveTo(x - width * 0.28, top + height * 0.08);
      ctx.lineTo(x - width * 0.86, top - height * 0.08);
      ctx.lineTo(x - width * 0.44, top + height * 0.22);
      ctx.closePath();
      ctx.moveTo(x + width * 0.28, top + height * 0.08);
      ctx.lineTo(x + width * 0.86, top - height * 0.08);
      ctx.lineTo(x + width * 0.44, top + height * 0.22);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ff123f";
      ctx.shadowColor = "#ff4968";
      ctx.shadowBlur = 18 * glow;
      ctx.fillRect(x - width * 0.24, top + height * 0.17, width * 0.15, Math.max(2, height * 0.025));
      ctx.fillRect(x + width * 0.09, top + height * 0.17, width * 0.15, Math.max(2, height * 0.025));

      ctx.shadowBlur = 10;
      ctx.fillStyle = "#1f2638";
      ctx.fillRect(x + width * 0.48, torsoTop + height * 0.06, width * 0.72, height * 0.13);
      ctx.fillStyle = "#ff123f";
      ctx.fillRect(x + width * 1.08, torsoTop + height * 0.08, width * 0.2, height * 0.08);

      ctx.restore();
    },
  };
}

function particleToRenderable(particle) {
  const point = project(particle.x, particle.z, particle.y);
  if (!point) {
    return null;
  }

  return {
    depth: point.depth,
    draw() {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = particle.life;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(2, 80 / point.depth), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  };
}

function drawWorldLine(x1, z1, x2, z2) {
  const p1 = project(x1, z1, 0);
  const p2 = project(x2, z2, 0);
  if (!p1 || !p2) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

function drawCrosshair() {
  const x = canvas.width / 2;
  const y = canvas.height / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 15, y);
  ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 15, y);
  ctx.moveTo(x, y - 15);
  ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x, y + 15);
  ctx.stroke();
}

function drawWeapon() {
  const cx = canvas.width / 2;
  const bottom = canvas.height;
  ctx.fillStyle = "#10172f";
  ctx.fillRect(cx - 54, bottom - 112, 108, 112);
  ctx.fillStyle = "#293b75";
  ctx.fillRect(cx - 22, bottom - 170, 44, 96);
  ctx.fillStyle = "#49f2ff";
  ctx.fillRect(cx - 14, bottom - 176, 28, 8);

  if (state.muzzleFlash > 0) {
    ctx.fillStyle = `rgba(255, 209, 102, ${state.muzzleFlash})`;
    ctx.beginPath();
    ctx.arc(cx, bottom - 188, 28 * state.muzzleFlash, 0, Math.PI * 2);
    ctx.fill();
  }
}

function project(x, z, y) {
  const player = state.player;
  const dx = x - player.x;
  const dz = z - player.z;
  const sin = Math.sin(player.angle);
  const cos = Math.cos(player.angle);
  const side = dx * cos - dz * sin;
  const depth = dx * sin + dz * cos;

  if (depth <= 0.25) {
    return null;
  }

  const focal = canvas.width * 0.78;
  const screenX = canvas.width / 2 + (side / depth) * focal;
  const screenY = canvas.height * 0.56 - ((y - 1.2) / depth) * focal;
  return { x: screenX, y: screenY, depth };
}

function spawnImpact(x, z, color) {
  for (let i = 0; i < 14; i += 1) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 1.2,
      z: z + (Math.random() - 0.5) * 1.2,
      y: 1 + Math.random() * 2,
      color,
      life: 0.8 + Math.random() * 0.2,
      vy: 1 + Math.random() * 2,
    });
  }
}

function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.life -= dt * 1.5;
    particle.y += particle.vy * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function endGame(won) {
  state.running = false;
  state.ended = true;
  updateHud();
  showMessage(
    won ? "Victory" : "Defeat",
    won ? "You won the arena duel." : "The computer opponent won this round.",
    "Play Again",
  );
}

function distance(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared, 0, 1);
  return distance(point.x, point.z, a.x + t * dx, a.z + t * dz);
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  if (event.code === "Space") {
    shoot();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", resetGame);

resetGame();
