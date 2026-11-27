import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
// Importa o pós-processamento para criar o brilho (Bloom) nos neons
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// ==========================================
// 1. VARIÁVEIS GLOBAIS
// ==========================================
let scene, camera, renderer, clock, composer;
let isGameActive = false;
let health = 100, coins = 0, ammo = 30, currentWeapon = 1;
let yaw = 0, pitch = 0;
let canJump = true, velocityY = 0;
const keys = {};
let enemies = [];
let walls = [];
let particles = [];
let weaponModel;
let weaponRecoil = 0; // Para o efeito de recuo da arma

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const hudHealth = document.getElementById('hud-health');
const hudCoins = document.getElementById('hud-coins');
const hudWeapon = document.getElementById('hud-weapon');
const hudAmmo = document.getElementById('hud-ammo');

// ==========================================
// 2. INICIALIZAÇÃO (THREE.JS + PÓS-PROCESSAMENTO)
// ==========================================
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020205);
    // Névoa mais densa para dar profundidade
    scene.fog = new THREE.FogExp2(0x020205, 0.04);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    clock = new THREE.Clock();

    // Configuração do Bloom (O brilho dos neons)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2; // O que é considerado brilhante
    bloomPass.strength = 1.2;  // Intensidade do brilho
    bloomPass.radius = 0.5;    // Espalhamento do brilho

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    setupLights();
    buildMap();
    createWeaponModel();
    spawnEnemies();
    setupControls();
    updateHUD();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    overlay.addEventListener('click', () => {
        canvas.requestPointerLock();
        initAudio();
    });

    document.addEventListener('pointerlockchange', () => {
        isGameActive = document.pointerLockElement === canvas;
        overlay.style.display = isGameActive ? 'none' : 'flex';
    });

    animate();
}

function setupLights() {
    // Luz ambiente muito baixa (o Bloom vai criar a luz principal)
    scene.add(new THREE.AmbientLight(0x111122, 0.5));
    
    // Luz direcional fraca
    const dirLight = new THREE.DirectionalLight(0x3366ff, 0.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Luz vermelha de emergência
    const redLight = new THREE.PointLight(0xff0000, 5, 20);
    redLight.position.set(0, 4, -10);
    scene.add(redLight);
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
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Digit1') { currentWeapon = 1; updateWeaponVisual(); updateHUD(); }
        if (e.code === 'Digit2') { currentWeapon = 2; updateWeaponVisual(); updateHUD(); }
    });

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
    const isRunning = keys['ShiftLeft'];
    const speed = (isRunning ? 12 : 6) * delta;
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
        
        let collides = false;
        for (let w of walls) {
            if (nextPos.x > w.minX - 0.5 && nextPos.x < w.maxX + 0.5 && nextPos.z > w.minZ - 0.5 && nextPos.z < w.maxZ + 0.5) {
                collides = true; break;
            }
        }
        if (!collides) camera.position.add(moveVector);
    }

    // Efeito de balançar a arma ao andar (View Bobbing)
    if (moveVector.length() > 0) {
        const bob = Math.sin(clock.elapsedTime * (isRunning ? 15 : 10)) * 0.05;
        weaponModel.position.y = -0.3 + bob;
        weaponModel.position.x = Math.cos(clock.elapsedTime * (isRunning ? 7.5 : 5)) * 0.05;
    }

    // Recuo da arma (Retorna ao normal)
    weaponRecoil = THREE.MathUtils.lerp(weaponRecoil, 0, delta * 10);
    weaponModel.position.z = -0.5 - weaponRecoil;
}

// ==========================================
// 4. MAPA (MEGASESTRUTURA ESTILIZADA)
// ==========================================
function buildMap() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.6 });
    
    // Textura procedural para as paredes (simula painéis)
    const canvasTex = document.createElement('canvas');
    canvasTex.width = 128; canvasTex.height = 128;
    const ctx = canvasTex.getContext('2d');
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.strokeRect(4, 4, 120, 120);
    const wallTex = new THREE.CanvasTexture(canvasTex);
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(2, 2);

    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x444444, 
        map: wallTex,
        roughness: 0.8, 
        metalness: 0.4 
    });

    const neonBlueMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const neonRedMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });

    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Teto
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6;
    scene.add(ceiling);

    const createWall = (x, z, w, d, h = 6) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, h / 2, z);
        wall.castShadow = true; wall.receiveShadow = true;
        scene.add(wall);
        
        walls.push({
            minX: x - w / 2, maxX: x + w / 2,
            minZ: z - d / 2, maxZ: z + d / 2
        });

        // Neon nas bordas das paredes (dá o efeito de brilho com o Bloom)
        const stripMat = Math.random() > 0.5 ? neonBlueMat : neonRedMat;
        if (w > d) {
            const strip1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), stripMat);
            strip1.position.set(x, h - 0.5, z - d/2);
            scene.add(strip1);
            const strip2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.1), stripMat);
            strip2.position.set(x, h - 0.5, z + d/2);
            scene.add(strip2);
        } else {
            const strip1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, d), stripMat);
            strip1.position.set(x - w/2, h - 0.5, z);
            scene.add(strip1);
            const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, d), stripMat);
            strip2.position.set(x + w/2, h - 0.5, z);
            scene.add(strip2);
        }
    };

    createWall(0, 50, 100, 2); createWall(0, -50, 100, 2);
    createWall(50, 0, 2, 100); createWall(-50, 0, 2, 100);
    createWall(-10, 10, 2, 20); createWall(10, -10, 2, 20);
    createWall(0, -20, 20, 2); createWall(-20, 0, 20, 2);
    createWall(25, 25, 2, 15); createWall(-25, -25, 2, 15);
}

// ==========================================
// 5. ARMAS E VIEWMODEL
// ==========================================
function createWeaponModel() {
    weaponModel = new THREE.Group();
    
    // Pé de cabra (Padrão)
    const crowbarGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
    const crowbarMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.3 });
    const crowbar = new THREE.Mesh(crowbarGeo, crowbarMat);
    crowbar.rotation.x = Math.PI / 4;
    crowbar.position.set(0, 0, -0.2);
    weaponModel.add(crowbar);

    // Adiciona um brilho ciano na ponta do pé de cabra
    const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    tipLight.position.set(0, 0.28, -0.48);
    weaponModel.add(tipLight);

    weaponModel.position.set(0.3, -0.3, -0.5);
    camera.add(weaponModel);
    scene.add(camera);
}

function updateWeaponVisual() {
    // Limpa o modelo atual
    while(weaponModel.children.length > 0){ 
        weaponModel.remove(weaponModel.children[0]); 
    }

    if (currentWeapon === 1) {
        // Pé de cabra
        const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.3 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 4;
        mesh.position.set(0, 0, -0.2);
        weaponModel.add(mesh);
        
        const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        tipLight.position.set(0, 0.28, -0.48);
        weaponModel.add(tipLight);
    } else {
        // Pistola
        const geo = new THREE.BoxGeometry(0.1, 0.15, 0.4);
        const mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.4 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 0, -0.3);
        weaponModel.add(mesh);

        // Detalhe neon da pistola
        const detail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        detail.position.set(0.05, 0.05, -0.3);
        weaponModel.add(detail);
    }
}

// ==========================================
// 6. INIMIGOS E COMBATE
// ==========================================
const raycaster = new THREE.Raycaster();

function spawnEnemies() {
    // Modelo do robô mais detalhado
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const eyeGeo = new THREE.BoxGeometry(0.4, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Olho brilhante

    for (let i = 0; i < 6; i++) {
        const robot = new THREE.Group();
        
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        body.position.y = 0.75; // Metade da altura para ficar no chão
        robot.add(body);

        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0, 1.2, -0.41); // Frente do robô
        robot.add(eye);

        robot.position.set(Math.random() * 60 - 30, 0, Math.random() * 60 - 30);
        scene.add(robot);
        
        enemies.push({ 
            mesh: robot, 
            health: 3, 
            speed: 2.5, 
            dead: false 
        });
    }
}

function updateEnemies(delta) {
    if (!isGameActive) return;

    enemies.forEach((enemy) => {
        if (enemy.dead) return;

        const dist = camera.position.distanceTo(enemy.mesh.position);
        
        if (dist < 30) {
            // Perseguição
            const dir = new THREE.Vector3().subVectors(camera.position, enemy.mesh.position);
            dir.y = 0; dir.normalize();
            enemy.mesh.position.add(dir.multiplyScalar(enemy.speed * delta));
            enemy.mesh.lookAt(camera.position.x, 0, camera.position.z);

            // Piscar o olho (efeito de tensão)
            enemy.mesh.children[1].material.color.setHex(Math.sin(clock.elapsedTime * 10) > 0 ? 0xff0000 : 0x440000);

            if (dist < 2.0) {
                health -= 15 * delta;
                updateHUD();
                // Efeito de dano na tela (Flash vermelho)
                renderer.domElement.style.boxShadow = "inset 0 0 100px rgba(255,0,0,0.5)";
                setTimeout(() => renderer.domElement.style.boxShadow = "none", 100);
                
                if (health <= 0) die();
            }
        }
    });
}

function shootOrMelee() {
    weaponRecoil = 0.1; // Efeito de recuo

    if (currentWeapon === 1) {
        // Pé de cabra (Melee)
        playSound('melee');
        const hit = raycaster.intersectObjects(enemies.filter(e => !e.dead).map(e => e.mesh), true)[0];
        if (hit && hit.distance < 3.5) {
            const enemy = enemies.find(e => e.mesh === hit.object.parent);
            if (enemy) {
                enemy.health -= 1;
                createSparks(hit.point, 0x00ffff);
                if (enemy.health <= 0) killEnemy(enemy);
            }
        }
    } else {
        // Pistola
        if (ammo <= 0) return;
        ammo--;
        playSound('shoot');
        
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = raycaster.intersectObjects(enemies.filter(e => !e.dead).map(e => e.mesh), true)[0];
        
        if (hit) {
            const enemy = enemies.find(e => e.mesh === hit.object.parent);
            if (enemy) {
                enemy.health -= 1;
                createSparks(hit.point, 0xff0044);
                if (enemy.health <= 0) killEnemy(enemy);
            }
        }
        updateHUD();
    }
}

function createSparks(position, color) {
    // Sistema de partículas simples para o impacto
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 15;
    const posArray = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 0.5;
    }
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({ color: color, size: 0.05, transparent: true });
    const particlesMesh = new THREE.Points(particleGeo, particleMat);
    particlesMesh.position.copy(position);
    
    scene.add(particlesMesh);
    particles.push({ mesh: particlesMesh, life: 1.0 });
}

function killEnemy(enemy) {
    enemy.dead = true;
    enemy.mesh.visible = false;
    coins += 10;
    updateHUD();
    playSound('coin');
}

function die() {
    isGameActive = false;
    document.exitPointerLock();
    overlay.innerHTML = "SISTEMA CRÍTICO<br><span>VOCÊ MORREU. Atualize para reiniciar.</span>";
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

let audioCtx;
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
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'coin') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(1500, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
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

        // Atualiza as partículas de impacto
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].life -= delta * 3;
            particles[i].mesh.material.opacity = particles[i].life;
            particles[i].mesh.position.y -= delta * 0.5;
            if (particles[i].life <= 0) {
                scene.remove(particles[i].mesh);
                particles.splice(i, 1);
            }
        }
    }

    // Renderiza com os efeitos de pós-processamento (Bloom)
    composer.render();
}

// Inicia tudo
init();
