import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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
let weaponRecoil = 0;

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const hudHealth = document.getElementById('hud-health');
const hudCoins = document.getElementById('hud-coins');
const hudWeapon = document.getElementById('hud-weapon');
const hudAmmo = document.getElementById('hud-ammo');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2d4c1e); // Fundo verde floresta
    scene.fog = new THREE.FogExp2(0x2d4c1e, 0.04); // Névoa verde

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    clock = new THREE.Clock();

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.85);
    bloomPass.threshold = 0.7;
    bloomPass.strength = 0.6;
    bloomPass.radius = 0.4;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    setupLights();
    buildForest();
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
    scene.add(new THREE.AmbientLight(0x224411, 1.2));
    const sunLight = new THREE.DirectionalLight(0xffeebb, 2.0);
    sunLight.position.set(20, 40, 10);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    scene.add(sunLight);
}

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
        let collides = false;
        for (let w of walls) {
            if (nextPos.x > w.minX - 0.5 && nextPos.x < w.maxX + 0.5 && nextPos.z > w.minZ - 0.5 && nextPos.z < w.maxZ + 0.5) {
                collides = true; break;
            }
        }
        if (!collides) camera.position.add(moveVector);
        
        const bob = Math.sin(clock.elapsedTime * (keys['ShiftLeft'] ? 15 : 10)) * 0.05;
        weaponModel.position.y = -0.3 + bob;
        weaponModel.position.x = Math.cos(clock.elapsedTime * (keys['ShiftLeft'] ? 7.5 : 5)) * 0.05;
    }
    weaponRecoil = THREE.MathUtils.lerp(weaponRecoil, 0, delta * 10);
    weaponModel.position.z = -0.5 - weaponRecoil;
}

function buildForest() {
    const canvasTex = document.createElement('canvas');
    canvasTex.width = 256; canvasTex.height = 256;
    const ctx = canvasTex.getContext('2d');
    ctx.fillStyle = '#2b4a1e'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#345c24' : '#1a3010';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 3, Math.random() * 3);
    }
    const groundTex = new THREE.CanvasTexture(canvasTex);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(50, 50);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.9 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x1a5c1a, roughness: 0.8 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2d8a2d, roughness: 0.8 });

    for (let i = 0; i < 150; i++) {
        let x = (Math.random() - 0.5) * 140;
        let z = (Math.random() - 0.5) * 140;
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
        
        const treeGroup = new THREE.Group();
        const trunkHeight = 4 + Math.random() * 3;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, trunkHeight, 6), trunkMat);
        trunk.position.y = trunkHeight / 2;
        trunk.castShadow = true; trunk.receiveShadow = true;
        treeGroup.add(trunk);

        const c1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 3, 6), leafMat1);
        c1.position.y = trunkHeight; c1.castShadow = true;
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.5, 6), leafMat2);
        c2.position.y = trunkHeight + 1.5; c2.castShadow = true;
        const c3 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 6), leafMat1);
        c3.position.y = trunkHeight + 3; c3.castShadow = true;
        treeGroup.add(c1, c2, c3);

        treeGroup.position.set(x, 0, z);
        treeGroup.rotation.y = Math.random() * Math.PI;
        scene.add(treeGroup);

        walls.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
    }
}

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
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.5, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const eyeGeo = new THREE.BoxGeometry(0.4, 0.1, 0.1);

    for (let i = 0; i < 8; i++) {
        const robot = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.75; body.castShadow = true;
        robot.add(body);
        const eye = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        eye.position.set(0, 1.2, -0.41);
        robot.add(eye);

        robot.position.set((Math.random() - 0.5) * 120, 0, (Math.random() - 0.5) * 120);
        scene.add(robot);
        enemies.push({ mesh: robot, health: 3, speed: 3, dead: false });
    }
}

function updateEnemies(delta) {
    if (!isGameActive) return;
    enemies.forEach((enemy) => {
        if (enemy.dead) return;
        const dist = camera.position.distanceTo(enemy.mesh.position);
        if (dist < 30) {
            const dir = new THREE.Vector3().subVectors(camera.position, enemy.mesh.position);
            dir.y = 0; dir.normalize();
            enemy.mesh.position.add(dir.multiplyScalar(enemy.speed * delta));
            enemy.mesh.lookAt(camera.position.x, 0, camera.position.z);
            enemy.mesh.children[1].material.color.setHex(Math.sin(clock.elapsedTime * 10) > 0 ? 0xff0000 : 0x440000);
            if (dist < 2.0) {
                health -= 15 * delta;
                updateHUD();
                renderer.domElement.style.boxShadow = "inset 0 0 100px rgba(255,0,0,0.5)";
                setTimeout(() => renderer.domElement.style.boxShadow = "none", 100);
                if (health <= 0) die();
            }
        }
    });
}

function shootOrMelee() {
    weaponRecoil = 0.1;
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
