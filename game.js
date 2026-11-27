import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ==========================================
// 1. VARIÁVEIS GLOBAIS
// ==========================================
let scene, camera, renderer, clock;
let isGameActive = false;
let health = 100, coins = 0, ammo = 10, currentWeapon = 1;
let yaw = 0, pitch = 0;
let canJump = true, velocityY = 0;
const keys = {};
let enemies = [];
let walls = [];
let bullets = [];
let audioCtx;

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const hudHealth = document.getElementById('hud-health');
const hudCoins = document.getElementById('hud-coins');
const hudWeapon = document.getElementById('hud-weapon');
const hudAmmo = document.getElementById('hud-ammo');

// ==========================================
// 2. INICIALIZAÇÃO (THREE.JS)
// ==========================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.03);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    clock = new THREE.Clock();

    // Luzes
    scene.add(new THREE.AmbientLight(0x222233, 2));
    const dirLight = new THREE.DirectionalLight(0x4466cc, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    buildMap();
    spawnEnemies();
    setupControls();
    updateHUD();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    overlay.addEventListener('click', () => {
        canvas.requestPointerLock();
        initAudio(); // Inicializa áudio no primeiro clique
    });

    document.addEventListener('pointerlockchange', () => {
        isGameActive = document.pointerLockElement === canvas;
        overlay.style.display = isGameActive ? 'none' : 'flex';
    });

    animate();
}

// ==========================================
// 3. CONTROLES E MOVIMENTAÇÃO
// ==========================================
function setupControls() {
    document.addEventListener('mousemove', (e) => {
        if (!isGameActive) return;
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, pitch));
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    });

    document.addEventListener('keydown', (e) => keys[e.code] = true);
    document.addEventListener('keyup', (e) => keys[e.code] = false);

    document.addEventListener('mousedown', (e) => {
        if (!isGameActive) return;
        if (e.button === 0) shootOrMelee();
        if (e.button === 2) { // Botão direito (mirar ou ataque secundário)
            // Placeholder para o futuro
        }
    });

    // Trocar de arma
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Digit1') { currentWeapon = 1; updateHUD(); }
        if (e.code === 'Digit2') { currentWeapon = 2; updateHUD(); }
    });

    // Evitar menu de contexto ao clicar com o direito
    document.addEventListener('contextmenu', e => e.preventDefault());
}

function updatePlayer(delta) {
    if (!isGameActive) return;

    // Pulo e Gravidade
    if (keys['Space'] && canJump) {
        velocityY = 8;
        canJump = false;
    }
    velocityY -= 25 * delta;
    camera.position.y += velocityY * delta;
    if (camera.position.y <= 1.6) {
        camera.position.y = 1.6;
        velocityY = 0;
        canJump = true;
    }

    // Movimento WASD
    const speed = (keys['ShiftLeft'] ? 12 : 6) * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0; right.normalize();

    const moveVector = new THREE.Vector3();
    if (keys['KeyW']) moveVector.add(forward);
    if (keys['KeyS']) moveVector.sub(forward);
    if (keys['KeyD']) moveVector.add(right);
    if (keys['KeyA']) moveVector.sub(right);
    
    if (moveVector.length() > 0) {
        moveVector.normalize().multiplyScalar(speed);
        const nextPos = camera.position.clone().add(moveVector);
        
        // Colisão Simples (AABB contra paredes)
        let collides = false;
        for (let w of walls) {
            if (nextPos.x > w.minX && nextPos.x < w.maxX && nextPos.z > w.minZ && nextPos.z < w.maxZ) {
                collides = true; break;
            }
        }
        if (!collides) camera.position.add(moveVector);
    }
}

// ==========================================
// 4. MAPA (MEGASESTRUTURA)
// ==========================================
function buildMap() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.5 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.2 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Função para criar parede com colisão
    const createWall = (x, z, w, d, h = 5) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, h / 2, z);
        wall.castShadow = true; wall.receiveShadow = true;
        scene.add(wall);
        
        // Salva os limites para colisão
        walls.push({
            minX: x - w / 2, maxX: x + w / 2,
            minZ: z - d / 2, maxZ: z + d / 2
        });

        // Neon na parede
        if (w > 2) {
            const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), neonMat);
            lightStrip.position.set(x, 3, z + d/2);
            scene.add(lightStrip);
        }
    };

    // Limites externos
    createWall(0, 50, 100, 2); createWall(0, -50, 100, 2);
    createWall(50, 0, 2, 100); createWall(-50, 0, 2, 100);

    // Paredes internas (labirinto)
    createWall(-10, 10, 2, 20); createWall(10, -10, 2, 20);
    createWall(0, -20, 20, 2); createWall(-20, 0, 20, 2);
    createWall(25, 25, 2, 15); createWall(-25, -25, 2, 15);
}

// ==========================================
// 5. INIMIGOS (ROBÔS)
// ==========================================
function spawnEnemies() {
    const robotGeo = new THREE.BoxGeometry(1, 2, 1);
    const robotMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x550000 });

    for (let i = 0; i < 5; i++) {
        const robot = new THREE.Mesh(robotGeo, robotMat);
        robot.position.set(Math.random() * 40 - 20, 1, Math.random() * 40 - 20);
        robot.castShadow = true;
        scene.add(robot);
        enemies.push({ mesh: robot, health: 3, speed: 3, lastShot: 0 });
    }
}

function updateEnemies(delta) {
    if (!isGameActive) return;

    enemies.forEach((enemy, index) => {
        if (enemy.health <= 0) return;

        const dist = camera.position.distanceTo(enemy.mesh.position);
        
        // Perseguição
        if (dist < 25) {
            const dir = new THREE.Vector3().subVectors(camera.position, enemy.mesh.position);
            dir.y = 0; dir.normalize();
            enemy.mesh.position.add(dir.multiplyScalar(enemy.speed * delta));
            enemy.mesh.lookAt(camera.position.x, enemy.mesh.position.y, camera.position.z);

            // Ataque
            if (dist < 2.5) {
                health -= 20 * delta * 10; // Dano corpo a corpo
                updateHUD();
                if (health <= 0) die();
            }
        }
    });
}

// ==========================================
// 6. ARMAS E COMBATE
// ==========================================
const raycaster = new THREE.Raycaster();

function shootOrMelee() {
    if (currentWeapon === 1) {
        // Pé de cabra (Melee)
        if (camera.position.distanceTo(enemies[0]?.mesh.position || new THREE.Vector3(100,100,100)) < 3) {
            // Simplificado: apenas checa o mais próximo
            const hit = raycaster.intersectObjects(enemies.map(e => e.mesh))[0];
            if (hit && hit.distance < 3) {
                const enemy = enemies.find(e => e.mesh === hit.object);
                enemy.health -= 1;
                playSound('melee');
                if (enemy.health <= 0) killEnemy(enemy);
            }
        }
    } else {
        // Pistola (Hitscan)
        if (ammo <= 0) return;
        ammo--;
        playSound('shoot');
        
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = raycaster.intersectObjects(enemies.map(e => e.mesh))[0];
        
        if (hit) {
            const enemy = enemies.find(e => e.mesh === hit.object);
            enemy.health -= 1;
            if (enemy.health <= 0) killEnemy(enemy);
        }
        updateHUD();
    }
}

function killEnemy(enemy) {
    scene.remove(enemy.mesh);
    coins += 10;
    updateHUD();
    playSound('coin');
}

function die() {
    isGameActive = false;
    document.exitPointerLock();
    overlay.innerHTML = "VOCÊ MORREU<br><span>Atualize a página para reiniciar</span>";
    overlay.style.display = 'flex';
}

// ==========================================
// 7. HUD E ÁUDIO
// ==========================================
function updateHUD() {
    hudHealth.innerText = `VIDA: ${Math.ceil(health)}`;
    hudCoins.innerText = `MOEDAS: ${coins}`;
    if (currentWeapon === 1) {
        hudWeapon.innerText = "ARMA: PÉ DE CABRA";
        hudAmmo.innerText = "MUNIÇÃO: ∞";
    } else {
        hudWeapon.innerText = "ARMA: PISTOLA";
        hudAmmo.innerText = `MUNIÇÃO: ${ammo}`;
    }
}

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);

    if (type === 'shoot') {
        osc.type = 'square'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'melee') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'coin') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    }
}

// ==========================================
// 8. LOOP PRINCIPAL
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);

    if (isGameActive) {
        updatePlayer(delta);
        updateEnemies(delta);
    }

    renderer.render(scene, camera);
}

// Inicia tudo
init();
