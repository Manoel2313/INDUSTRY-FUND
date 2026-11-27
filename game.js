import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

let scene, camera, renderer, clock, composer;
let isGameActive = false;
let health = 100, coins = 0, ammo = 30, currentWeapon = 1;
let yaw = 0, pitch = 0;
let canJump = true, velocityY = 0;
const keys = {};
let enemies = [];
let walls = []; // Colisão das árvores grandes
let weaponModel;
let weaponRecoil = 0;

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const hudHealth = document.getElementById('hud-health');
const hudCoins = document.getElementById('hud-coins');
const hudWeapon = document.getElementById('hud-weapon');
const hudAmmo = document.getElementById('hud-ammo');

// Ruído para gerar o terreno
const perlin = new ImprovedNoise();
const z = 100;

function init() {
    scene = new THREE.Scene();
    // Cor da névoa (umidade da floresta)
    const fogColor = 0x1a2e14; 
    scene.fog = new THREE.FogExp2(fogColor, 0.025); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2.5, 0); // Câmera um pouco mais alta por causa das colinas

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;

    clock = new THREE.Clock();

    // Efeito de brilho (dá um aspecto de umidade e luz filtrada)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.85);
    bloomPass.threshold = 0.8;
    bloomPass.strength = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    setupLights();
    generateTerrain();
    populateForest();
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
    // Luz ambiente verde-escura (sombra da floresta)
    scene.add(new THREE.AmbientLight(0x1a2e14, 1.0));
    
    // O Sol (Raios de luz)
    const sunLight = new THREE.DirectionalLight(0xffeebb, 3.5);
    sunLight.position.set(30, 50, -20); // Sol inclinado para criar sombras longas
    sunLight.castShadow = true;
    
    // Otimização das sombras
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
    sunLight.shadow.bias = -0.001; // Remove o "serrilhado" das sombras
    scene.add(sunLight);
}

// ==========================================
// TERRENO E FLORESTA AVANÇADA
// ==========================================
function generateTerrain() {
    // Gera uma textura procedural super detalhada para o chão
    const canvasSize = 512;
    const c = document.createElement('canvas');
    c.width = canvasSize; c.height = canvasSize;
    const ctx = c.getContext('2d');
    
    // Base marrom escura (terra)
    ctx.fillStyle = '#1e1108'; ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    // Manchas verdes (musgo e grama)
    for (let i = 0; i < 15000; i++) {
        const x = Math.random() * canvasSize;
        const y = Math.random() * canvasSize;
        const r = Math.random() * 4;
        ctx.fillStyle = Math.random() > 0.4 ? '#2d4c1e' : '#1a330d';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    
    // Folhas secas (pontos marrons)
    for (let i = 0; i < 8000; i++) {
        ctx.fillStyle = '#3b2b1a';
        ctx.fillRect(Math.random() * canvasSize, Math.random() * canvasSize, 2, 2);
    }

    const groundTex = new THREE.CanvasTexture(c);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(30, 30);
    groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Cria um terreno com colinas suaves (em vez de plano)
    const terrainGeo = new THREE.PlaneGeometry(200, 200, 64, 64);
    terrainGeo.rotateX(-Math.PI / 2);

    const vertices = terrainGeo.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        // Gera altura usando Perlin Noise
        const height = perlin.noise(x * 0.05, z * 0.05, 0) * 3;
        vertices[i + 1] = height; 
    }
    terrainGeo.computeVertexNormals(); // Corrige a iluminação

    const groundMat = new THREE.MeshStandardMaterial({ 
        map: groundTex, 
        roughness: 1.0,
        color: 0x888888 // Escurece um pouco a textura base
    });

    const terrain = new THREE.Mesh(terrainGeo, groundMat);
    terrain.receiveShadow = true;
    scene.add(terrain);
}

function populateForest() {
    // MATERIAIS
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1.0, bumpScale: 0.1 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x143814, roughness: 0.9 }); // Copa escura
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x1e571e, roughness: 0.9 }); // Copa clara
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x2d7a2d, side: THREE.DoubleSide, roughness: 1 });

    // Geometrias compartilhadas (Performance)
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.5, 8, 5);
    const leafGeo = new THREE.ConeGeometry(2.5, 4, 5);
    const fernGeo = new THREE.ConeGeometry(1.5, 0.8, 4, 1, true);

    // INSTANCED MESH (Renderiza milhares de objetos de uma vez sem travar)
    const totalTrees = 800;
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, totalTrees);
    const leaves1 = new THREE.InstancedMesh(leafGeo, leafMat1, totalTrees);
    const leaves2 = new THREE.InstancedMesh(leafGeo, leafMat2, totalTrees);
    
    trunks.castShadow = true; leaves1.castShadow = true; leaves2.castShadow = true;

    const dummy = new THREE.Object3D();

    for (let i = 0; i < totalTrees; i++) {
        // Posição aleatória no terreno
        const x = (Math.random() - 0.5) * 180;
        const z = (Math.random() - 0.5) * 180;
        
        // Não gera árvores em cima do spawn do jogador
        if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;

        const h = perlin.noise(x * 0.05, z * 0.05, 0) * 3; // Altura do terreno

        // Tronco
        dummy.position.set(x, h + 4, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(1, 1 + Math.random() * 0.5, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        // Copa (Nível 1)
        dummy.position.set(x, h + 8, z);
        dummy.scale.set(1 + Math.random(), 1 + Math.random(), 1 + Math.random());
        dummy.updateMatrix();
        leaves1.setMatrixAt(i, dummy.matrix);

        // Copa (Nível 2 - mais para cima)
        dummy.position.set(x, h + 11, z);
        dummy.scale.set(0.7, 0.7, 0.7);
        dummy.updateMatrix();
        leaves2.setMatrixAt(i, dummy.matrix);

        // Colisão
        walls.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
    }

    scene.add(trunks, leaves1, leaves2);

    // ADICIONA SAMAMBAIAS (Mato no chão)
    const totalFerns = 400;
    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, totalFerns);
    for (let i = 0; i < totalFerns; i++) {
        const x = (Math.random() - 0.5) * 180;
        const z = (Math.random() - 0.5) * 180;
        if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
        const h = perlin.noise(x * 0.05, z * 0.05, 0) * 3;
        dummy.position.set(x, h + 0.4, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(1 + Math.random(), 1 + Math.random(), 1 + Math.random());
        dummy.updateMatrix();
        ferns.setMatrixAt(i, dummy.matrix);
    }
    scene.add(ferns);
}

// ==========================================
// CONTROLES E LÓGICA DO JOGADOR
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

    // Pulo e Gravidade (Adaptado para o terreno)
    if (keys['Space'] && canJump) {
        velocityY = 8;
        canJump = false;
    }
    velocityY -= 25 * delta;
    camera.position.y += velocityY * delta;
    
    // Simula a altura do terreno no ponto onde o jogador está
    const groundHeight = perlin.noise(camera.position.x * 0.05, camera.position.z * 0.05, 0) * 3;
    const eyeHeight = groundHeight + 1.8; // Altura dos olhos

    if (camera.position.y <= eyeHeight) {
        camera.position.y = eyeHeight;
        velocityY = 0;
        canJump = true;
    }

    // Movimento
    const isRunning = keys['ShiftLeft'];
    const speed = (isRunning ? 14 : 7) * delta;
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
        
        // Colisão simplificada
        let collides = false;
        for (let w of walls) {
            if (nextPos.x > w.minX - 0.4 && nextPos.x < w.maxX + 0.4 && nextPos.z > w.minZ - 0.4 && nextPos.z < w.maxZ + 0.4) {
                collides = true; break;
            }
        }
        if (!collides) camera.position.add(moveVector);
        
        // Animação da arma
        const bob = Math.sin(clock.elapsedTime * (isRunning ? 18 : 12)) * 0.05;
        weaponModel.position.y = -0.3 + bob;
        weaponModel.position.x = 0.3 + Math.cos(clock.elapsedTime * (isRunning ? 9 : 6)) * 0.05;
    }
    
    weaponRecoil = THREE.MathUtils.lerp(weaponRecoil, 0, delta * 10);
    weaponModel.position.z = -0.5 - weaponRecoil;
}

// ==========================================
// ARMAS, INIMIGOS E COMBATE
// ==========================================
function createWeaponModel() {
    weaponModel = new THREE.Group();
    weaponModel.position.set(0.3, -0.3, -0.5);
    camera.add(weaponModel);
    scene.add(camera);
    updateWeaponVisual();
}

function updateWeaponVisual() {
    while(weaponModel.children.length > 0) weaponModel.remove(weaponModel.children[0]);
    if (currentWeapon === 1) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 1 }));
        mesh.rotation.x = Math.PI / 4; mesh.position.set(0, 0, -0.2);
        weaponModel.add(mesh);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
        tip.position.set(0, 0.28, -0.48);
        weaponModel.add(tip);
    } else {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9 }));
        mesh.position.set(0, 0, -0.3);
        weaponModel.add(mesh);
    }
}

const raycaster = new THREE.Raycaster();

function spawnEnemies() {
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 });
    const eyeGeo = new THREE.BoxGeometry(0.5, 0.1, 0.1);

    for (let i = 0; i < 10; i++) {
        const robot = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.9; body.castShadow = true;
        robot.add(body);
        const eye = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        eye.position.set(0, 1.4, -0.41);
        robot.add(eye);

        // Spawn em locais aleatórios (mas não em cima do jogador)
        robot.position.set((Math.random() - 0.5) * 100, 0, (Math.random() - 0.5) * 100);
        scene.add(robot);
        enemies.push({ mesh: robot, health: 3, speed: 2.5 + Math.random() * 2, dead: false });
    }
}

function updateEnemies(delta) {
    if (!isGameActive) return;
    enemies.forEach((enemy) => {
        if (enemy.dead) return;
        const dist = camera.position.distanceTo(enemy.mesh.position);
        
        // Eles te veem a 40 metros
        if (dist < 40) {
            const dir = new THREE.Vector3().subVectors(camera.position, enemy.mesh.position);
            dir.y = 0; dir.normalize();
            enemy.mesh.position.add(dir.multiplyScalar(enemy.speed * delta));
            
            // Ajusta a altura do robô para não flutuar/sumir no terreno
            const groundHeight = perlin.noise(enemy.mesh.position.x * 0.05, enemy.mesh.position.z * 0.05, 0) * 3;
            enemy.mesh.position.y = groundHeight;

            enemy.mesh.lookAt(camera.position.x, groundHeight, camera.position.z);
            
            // Olho piscando
            enemy.mesh.children[1].material.color.setHex(Math.sin(clock.elapsedTime * 15) > 0 ? 0xff0000 : 0x330000);

            if (dist < 2.0) {
                health -= 15 * delta;
                updateHUD();
                renderer.domElement.style.boxShadow = "inset 0 0 150px rgba(255,0,0,0.6)";
                setTimeout(() => renderer.domElement.style.boxShadow = "none", 100);
                if (health <= 0) die();
            }
        }
    });
}

function shootOrMelee() {
    weaponRecoil = 0.15;
    if (currentWeapon === 1) {
        playSound('melee');
        const hit = raycaster.intersectObjects(enemies.filter(e => !e.dead).map(e => e.mesh), true)[0];
        if (hit && hit.distance < 3.5) {
            const enemy = enemies.find(e => e.mesh === hit.object.parent);
            if (enemy) { enemy.health -= 1; if (enemy.health <= 0) killEnemy(enemy); }
        }
    } else {
        if (ammo <= 0) return;
        ammo--; playSound('shoot');
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hit = raycaster.intersectObjects(enemies.filter(e => !e.dead).map(e => e.mesh), true)[0];
        if (hit) {
            const enemy = enemies.find(e => e.mesh === hit.object.parent);
            if (enemy) { enemy.health -= 1; if (enemy.health <= 0) killEnemy(enemy); }
        }
        updateHUD();
    }
}

function killEnemy(enemy) {
    enemy.dead = true; enemy.mesh.visible = false;
    coins += 10; updateHUD(); playSound('coin');
}

function die() {
    isGameActive = false; document.exitPointerLock();
    overlay.innerHTML = "VOCÊ FOI CAÇADO<br><span>Atualize a página para reiniciar</span>";
    overlay.style.display = 'flex';
}

function updateHUD() {
    hudHealth.innerText = `VIDA: ${Math.ceil(health)}`;
    hudCoins.innerText = `MOEDAS: ${coins}`;
    hudWeapon.innerText = currentWeapon === 1 ? "ARMA: PÉ DE CABRA" : "ARMA: PISTOLA";
    hudAmmo.innerText = currentWeapon === 1 ? "MUNIÇÃO: ∞" : `MUNIÇÃO: ${ammo}`;
}

let audioCtx;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'shoot') { osc.type = 'square'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1); osc.start(); osc.stop(audioCtx.currentTime + 0.1); }
    else if (type === 'melee') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime); gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15); osc.start(); osc.stop(audioCtx.currentTime + 0.15); }
    else if (type === 'coin') { osc.type = 'sine'; osc.frequency.setValueAtTime(1500, audioCtx.currentTime); gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    if (isGameActive) { updatePlayer(delta); updateEnemies(delta); }
    composer.render();
}

init();
