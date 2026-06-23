import * as THREE from "three";

// ── Constants ──────────────────────────────────────────────────────────────
const ARENA_SIZE = 40;
const WALL_HEIGHT = 6;
const PLAYER_SPEED = 8;
const TURN_SPEED = 2.2;
const PLAYER_MAX_HP = 100;
const ENEMY_MAX_HP = 100;
const FIRE_RATE = 0.25;
const ENEMY_FIRE_RATE = 0.9;
const BULLET_DAMAGE = 12;
const ENEMY_DAMAGE = 8;
const ENEMY_SPEED = 4.5;
const ENEMY_DETECT_RANGE = 28;
const ENEMY_SHOOT_RANGE = 22;
const MOUSE_SENS = 0.002;

// ── DOM ────────────────────────────────────────────────────────────────────
const canvas = document.getElementById("game-canvas");
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const gameOverScreen = document.getElementById("game-over");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const playerHpBar = document.getElementById("player-hp");
const enemyHpBar = document.getElementById("enemy-hp");
const scoreEl = document.getElementById("score");
const messageEl = document.getElementById("message");
const resultTitle = document.getElementById("result-title");
const resultText = document.getElementById("result-text");

// ── State ──────────────────────────────────────────────────────────────────
let gameActive = false;
let playerHp = PLAYER_MAX_HP;
let enemyHp = ENEMY_MAX_HP;
let playerKills = 0;
let enemyKills = 0;
let lastFireTime = 0;
let enemyLastFireTime = 0;
let keys = {};
let yaw = 0;
let pitch = 0;

// ── Three.js setup ─────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x0a0a12);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a12, 20, 55);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.7, ARENA_SIZE / 2 - 4);

// Lighting
const ambient = new THREE.AmbientLight(0x334466, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
sun.position.set(10, 20, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
scene.add(sun);

const rimLight = new THREE.PointLight(0xff4466, 0.8, 40);
rimLight.position.set(-15, 4, -15);
scene.add(rimLight);

const rimLight2 = new THREE.PointLight(0x4488ff, 0.6, 40);
rimLight2.position.set(15, 4, 15);
scene.add(rimLight2);

// ── Arena ──────────────────────────────────────────────────────────────────
function buildArena() {
  const half = ARENA_SIZE / 2;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 20, 20);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.85,
    metalness: 0.15,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid lines on floor
  const gridHelper = new THREE.GridHelper(ARENA_SIZE, 20, 0x334466, 0x222244);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a44,
    roughness: 0.7,
    metalness: 0.3,
  });

  const wallGeo = new THREE.BoxGeometry(ARENA_SIZE, WALL_HEIGHT, 0.5);
  const walls = [
    { pos: [0, WALL_HEIGHT / 2, -half], rot: 0 },
    { pos: [0, WALL_HEIGHT / 2, half], rot: 0 },
    { pos: [-half, WALL_HEIGHT / 2, 0], rot: Math.PI / 2 },
    { pos: [half, WALL_HEIGHT / 2, 0], rot: Math.PI / 2 },
  ];

  walls.forEach(({ pos, rot }) => {
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(...pos);
    wall.rotation.y = rot;
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  });

  // Cover pillars
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5c, roughness: 0.6, metalness: 0.4 });
  const pillarPositions = [
    [-8, 0, -8], [8, 0, -8], [-8, 0, 8], [8, 0, 8],
    [0, 0, 0], [-12, 0, 0], [12, 0, 0],
  ];
  pillarPositions.forEach(([x, , z]) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), pillarMat);
    pillar.position.set(x, 1.5, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  });

  // Ceiling accent lights
  const lightStripMat = new THREE.MeshBasicMaterial({ color: 0xff4466 });
  for (let i = -1; i <= 1; i += 2) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE - 2, 0.1, 0.3), lightStripMat);
    strip.position.set(0, WALL_HEIGHT - 0.2, i * (half - 1));
    scene.add(strip);
  }
}

buildArena();

// ── Weapon model (attached to camera) ──────────────────────────────────────
const weaponGroup = new THREE.Group();
const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.1, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.8, roughness: 0.3 })
);
gunBody.position.set(0.2, -0.15, -0.35);
weaponGroup.add(gunBody);

const gunBarrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8),
  new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.9, roughness: 0.2 })
);
gunBarrel.rotation.x = Math.PI / 2;
gunBarrel.position.set(0.2, -0.12, -0.6);
weaponGroup.add(gunBarrel);

const muzzleFlash = new THREE.PointLight(0xffaa44, 0, 3);
muzzleFlash.position.set(0.2, -0.12, -0.75);
weaponGroup.add(muzzleFlash);

camera.add(weaponGroup);
scene.add(camera);

// ── Enemy bot ──────────────────────────────────────────────────────────────
const enemyGroup = new THREE.Group();

const enemyBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.5, 1.2, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0xff2244, roughness: 0.5, metalness: 0.3, emissive: 0x440011 })
);
enemyBody.position.y = 1.1;
enemyBody.castShadow = true;
enemyGroup.add(enemyBody);

const enemyHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0xff4466, roughness: 0.4, metalness: 0.5, emissive: 0x220008 })
);
enemyHead.position.y = 2.0;
enemyHead.castShadow = true;
enemyGroup.add(enemyHead);

const enemyGun = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.4),
  new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.8, roughness: 0.2 })
);
enemyGun.position.set(0.4, 1.3, -0.3);
enemyGroup.add(enemyGun);

const enemyEye = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
enemyEye.position.set(0, 2.05, 0.3);
enemyGroup.add(enemyEye);

enemyGroup.position.set(0, 0, -ARENA_SIZE / 2 + 4);
scene.add(enemyGroup);

// ── Bullets / effects ────────────────────────────────────────────────────────
const bulletPool = [];
const MAX_BULLETS = 30;

function getBullet() {
  if (bulletPool.length === 0) {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    bulletPool.push({ mesh, active: false, dir: new THREE.Vector3(), speed: 40, life: 0, fromEnemy: false });
  }
  return bulletPool.find((b) => !b.active);
}

function spawnBullet(origin, direction, fromEnemy = false) {
  const bullet = getBullet();
  if (!bullet) return;
  bullet.active = true;
  bullet.fromEnemy = fromEnemy;
  bullet.life = 1.5;
  bullet.mesh.position.copy(origin);
  bullet.dir.copy(direction).normalize();
  bullet.mesh.visible = true;
  bullet.mesh.material.color.set(fromEnemy ? 0xff2244 : 0xffaa44);
}

function updateBullets(dt) {
  bulletPool.forEach((b) => {
    if (!b.active) return;
    b.mesh.position.addScaledVector(b.dir, b.speed * dt);
    b.life -= dt;
    if (b.life <= 0) {
      b.active = false;
      b.mesh.visible = false;
      return;
    }

    // Hit enemy
    if (!b.fromEnemy) {
      const dist = b.mesh.position.distanceTo(enemyGroup.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      if (dist < 1.0) {
        damageEnemy(BULLET_DAMAGE);
        b.active = false;
        b.mesh.visible = false;
      }
    } else {
      const dist = b.mesh.position.distanceTo(camera.position);
      if (dist < 0.8) {
        damagePlayer(ENEMY_DAMAGE);
        b.active = false;
        b.mesh.visible = false;
      }
    }
  });
}

// ── Muzzle flash effect ────────────────────────────────────────────────────
let flashTimer = 0;

function showMuzzleFlash() {
  muzzleFlash.intensity = 3;
  flashTimer = 0.06;
}

function updateMuzzleFlash(dt) {
  if (flashTimer > 0) {
    flashTimer -= dt;
    if (flashTimer <= 0) muzzleFlash.intensity = 0;
  }
}

// ── Hitscan fallback for player shooting ───────────────────────────────────
const raycaster = new THREE.Raycaster();

function playerShoot() {
  const now = performance.now() / 1000;
  if (now - lastFireTime < FIRE_RATE) return;
  lastFireTime = now;

  showMuzzleFlash();
  weaponGroup.position.z = 0.05;
  setTimeout(() => { weaponGroup.position.z = 0; }, 60);

  const origin = camera.position.clone();
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

  spawnBullet(origin.clone().add(direction.clone().multiplyScalar(0.5)), direction, false);
  showMessage("FIRE!");
}

// ── Damage & UI ────────────────────────────────────────────────────────────
function updateHpBars() {
  playerHpBar.style.width = `${(playerHp / PLAYER_MAX_HP) * 100}%`;
  enemyHpBar.style.width = `${(enemyHp / ENEMY_MAX_HP) * 100}%`;
  scoreEl.textContent = `${playerKills} — ${enemyKills}`;
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.add("show");
  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => messageEl.classList.remove("show"), 800);
}

function damageEnemy(amount) {
  enemyHp = Math.max(0, enemyHp - amount);
  updateHpBars();
  enemyBody.material.emissive.setHex(0xff0000);
  setTimeout(() => enemyBody.material.emissive.setHex(0x440011), 100);

  if (enemyHp <= 0) {
    playerKills++;
    endRound(true);
  }
}

function damagePlayer(amount) {
  playerHp = Math.max(0, playerHp - amount);
  updateHpBars();
  document.body.style.boxShadow = "inset 0 0 80px rgba(255,0,0,0.4)";
  setTimeout(() => { document.body.style.boxShadow = "none"; }, 150);

  if (playerHp <= 0) {
    enemyKills++;
    endRound(false);
  }
}

function endRound(playerWon) {
  gameActive = false;
  hud.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");

  if (playerWon) {
    resultTitle.textContent = "VICTORY!";
    resultTitle.className = "win";
    resultText.textContent = `Bot eliminated. Score: ${playerKills} — ${enemyKills}`;
  } else {
    resultTitle.textContent = "DEFEATED";
    resultTitle.className = "lose";
    resultText.textContent = `The bot got you. Score: ${playerKills} — ${enemyKills}`;
  }
}

// ── Enemy AI ───────────────────────────────────────────────────────────────
let enemyPatrolTarget = new THREE.Vector3(-6, 0, -10);
let enemyPatrolTimer = 0;

function pickPatrolPoint() {
  const half = ARENA_SIZE / 2 - 3;
  enemyPatrolTarget.set(
    (Math.random() - 0.5) * half * 2,
    0,
    (Math.random() - 0.5) * half * 2
  );
}

function updateEnemyAI(dt) {
  const playerPos = camera.position;
  const enemyPos = enemyGroup.position;
  const toPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos);
  toPlayer.y = 0;
  const dist = toPlayer.length();

  // Face player
  if (dist > 0.1) {
    const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
    enemyGroup.rotation.y = targetAngle;
  }

  if (dist < ENEMY_DETECT_RANGE) {
    // Chase player
    if (dist > 3) {
      toPlayer.normalize();
      enemyGroup.position.addScaledVector(toPlayer, ENEMY_SPEED * dt);
    }

    // Shoot at player
    const now = performance.now() / 1000;
    if (dist < ENEMY_SHOOT_RANGE && now - enemyLastFireTime > ENEMY_FIRE_RATE) {
      enemyLastFireTime = now;
      const shootDir = new THREE.Vector3().subVectors(playerPos, enemyPos);
      shootDir.y += 0.5;
      shootDir.normalize();
      // Add slight inaccuracy
      shootDir.x += (Math.random() - 0.5) * 0.08;
      shootDir.y += (Math.random() - 0.5) * 0.05;
      shootDir.z += (Math.random() - 0.5) * 0.08;
      shootDir.normalize();

      const muzzlePos = enemyGroup.position.clone().add(new THREE.Vector3(0, 1.3, 0));
      spawnBullet(muzzlePos, shootDir, true);
    }
  } else {
    // Patrol
    enemyPatrolTimer -= dt;
    if (enemyPatrolTimer <= 0) {
      pickPatrolPoint();
      enemyPatrolTimer = 3 + Math.random() * 3;
    }
    const toPatrol = new THREE.Vector3().subVectors(enemyPatrolTarget, enemyPos);
    toPatrol.y = 0;
    if (toPatrol.length() > 1) {
      toPatrol.normalize();
      enemyGroup.rotation.y = Math.atan2(toPatrol.x, toPatrol.z);
      enemyGroup.position.addScaledVector(toPatrol, ENEMY_SPEED * 0.5 * dt);
    }
  }

  // Keep enemy in bounds
  const half = ARENA_SIZE / 2 - 1;
  enemyGroup.position.x = THREE.MathUtils.clamp(enemyGroup.position.x, -half, half);
  enemyGroup.position.z = THREE.MathUtils.clamp(enemyGroup.position.z, -half, half);
}

// ── Player movement ────────────────────────────────────────────────────────
function updatePlayer(dt) {
  if (keys["ArrowLeft"]) yaw += TURN_SPEED * dt;
  if (keys["ArrowRight"]) yaw -= TURN_SPEED * dt;

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const move = new THREE.Vector3();

  if (keys["ArrowUp"]) move.add(forward);
  if (keys["ArrowDown"]) move.sub(forward);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(PLAYER_SPEED * dt);
    camera.position.add(move);
  }

  // Keep player in bounds & at eye height
  const half = ARENA_SIZE / 2 - 1;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -half, half);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -half, half);
  camera.position.y = 1.7;

  // Simple wall collision with pillars
  const pillars = [
    [-8, -8], [8, -8], [-8, 8], [8, 8],
    [0, 0], [-12, 0], [12, 0],
  ];
  pillars.forEach(([px, pz]) => {
    const dx = camera.position.x - px;
    const dz = camera.position.z - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1.5) {
      const push = (1.5 - dist) / dist;
      camera.position.x += dx * push;
      camera.position.z += dz * push;
    }
  });
}

// ── Input ──────────────────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === "Space" && gameActive) {
    playerShoot();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// ── Game lifecycle ─────────────────────────────────────────────────────────
function resetGame() {
  playerHp = PLAYER_MAX_HP;
  enemyHp = ENEMY_MAX_HP;
  lastFireTime = 0;
  enemyLastFireTime = 0;
  yaw = 0;
  pitch = 0;

  camera.position.set(0, 1.7, ARENA_SIZE / 2 - 4);
  camera.rotation.set(0, 0, 0);

  enemyGroup.position.set(0, 0, -ARENA_SIZE / 2 + 4);
  pickPatrolPoint();
  enemyPatrolTimer = 2;

  bulletPool.forEach((b) => {
    b.active = false;
    b.mesh.visible = false;
  });

  updateHpBars();
  gameActive = true;
}

function startGame() {
  menu.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  hud.classList.remove("hidden");
  resetGame();
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

// ── Render loop ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameActive) {
    updatePlayer(dt);
    updateEnemyAI(dt);
    updateBullets(dt);
    updateMuzzleFlash(dt);

    // Subtle weapon bob
    const bob = Math.sin(performance.now() * 0.005) * 0.005;
    weaponGroup.position.y = -0.15 + bob;
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
