import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

// ==========================================
// CONFIGURAÇÕES E VARIÁVEIS GLOBAIS
// ==========================================
const WORLD_SIZE = 300; // Mapa gigante (300x300 metros)
const NOISE_SCALE = 0.01;

let scene, camera, renderer, composer, clock;
let isGameActive = false;
let yaw = 0, pitch = 0;
const keys = {};
const perlin = new ImprovedNoise();
const zOffset = Math.random() * 100;

// Elementos animados
let waterMaterial, fireflies, godRays;

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');

// ==========================================
// INICIALIZAÇÃO E RENDERIZADOR
// ==========================================
function init() {
    scene = new THREE.Scene();
    // Cor da neblina: Um tom esverdeado escuro e denso
    scene.fog = new THREE.FogExp2(0x051005, 0.015);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Começa no alto para ver o mapa
    camera.position.set(0, 40, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    clock = new THREE.Clock();

    // Pós-processamento (Bloom para luzes e água)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.8);
    bloomPass.threshold = 0.6;
    bloomPass.strength = 0.8;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    setupLights();
    
    // GERADORES DO MUNDO
    generateRuinsTerrain();
    generateRiver();
    generateGiantForest();
    generateMidForest();
    generateUndergrowth();
    generateAmbientParticles();
    generateFireflies();
    generateSkyRays();

    setupControls();

    window.addEventListener('resize', onWindowResize);
    overlay.addEventListener('click', () => canvas.requestPointerLock());

    document.addEventListener('pointerlockchange', () => {
        isGameActive = document.pointerLockElement === canvas;
        overlay.style.display = isGameActive ? 'none' : 'flex';
    });

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// ILUMINAÇÃO
// ==========================================
function setupLights() {
    // Luz ambiente base
    scene.add(new THREE.AmbientLight(0x112211, 1.5));
    
    // Luz do sol (amarelada, atravessando a mata)
    const sunLight = new THREE.DirectionalLight(0xffeebb, 3.5);
    sunLight.position.set(50, 100, -50);
    sunLight.castShadow = true;
    
    // Otimização de sombras para o mapa de 300m
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -150;
    sunLight.shadow.camera.right = 150;
    sunLight.shadow.camera.top = 150;
    sunLight.shadow.camera.bottom = -150;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Luzes locais nas ruínas (Neon antigo)
    const ruinLight1 = new THREE.PointLight(0x00ffff, 5, 50);
    ruinLight1.position.set(0, 20, 0);
    scene.add(ruinLight1);
    
    const ruinLight2 = new THREE.PointLight(0xff00aa, 5, 50);
    ruinLight2.position.set(30, 15, -30);
    scene.add(ruinLight2);
}

// ==========================================
// GERAÇÃO DE TERRENO (RUÍNAS + COLINAS)
// ==========================================
function getTerrainHeight(x, z) {
    let h = perlin.noise(x * NOISE_SCALE, z * NOISE_SCALE, zOffset) * 20;
    h += perlin.noise(x * NOISE_SCALE * 4, z * NOISE_SCALE * 4, zOffset) * 5;
    
    // Aprofunda um vale para o rio no meio do mapa
    const riverDist = Math.abs(x - Math.sin(z * 0.02) * 40);
    if (riverDist < 25) {
        h -= (1 - (riverDist / 25)) * 15;
    }
    return h;
}

function generateRuinsTerrain() {
    // 1. CHÃO (Texto procedural complexo)
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 1024; texCanvas.height = 1024;
    const ctx = texCanvas.getContext('2d');
    
    // Base de terra vermelha escura (típica da amazônia)
    ctx.fillStyle = '#2b140a'; 
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Ruído de musgo e grama
    for (let i = 0; i < 50000; i++) {
        ctx.fillStyle = Math.random() > 0.3 ? '#1a330d' : '#3b5e28';
        ctx.beginPath();
        ctx.arc(Math.random()*1024, Math.random()*1024, Math.random()*6, 0, Math.PI*2);
        ctx.fill();
    }
    
    // Rachaduras e pedras no chão
    for (let i = 0; i < 2000; i++) {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.random() * 2;
        ctx.beginPath();
        let sx = Math.random() * 1024;
        let sy = Math.random() * 1024;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.random()*20-10, sy + Math.random()*20-10);
        ctx.stroke();
    }

    const groundTex = new THREE.CanvasTexture(texCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(30, 30);

    const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
    terrainGeo.rotateX(-Math.PI / 2);
    
    const verts = terrainGeo.attributes.position.array;
    for (let i = 0; i < verts.length; i += 3) {
        verts[i+1] = getTerrainHeight(verts[i], verts[i+2]);
    }
    terrainGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({ 
        map: groundTex, 
        roughness: 1.0,
        color: 0xaaaaaa
    });
    const terrain = new THREE.Mesh(terrainGeo, groundMat);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // 2. RUÍNAS DE CONCRETO (Pilares e Plataformas)
    const ruinCount = 25;
    const pillarGeo = new THREE.BoxGeometry(4, 40, 4);
    const platformGeo = new THREE.BoxGeometry(15, 1, 15);
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.2 });

    for (let i = 0; i < ruinCount; i++) {
        const angle = (i / ruinCount) * Math.PI * 2;
        const radius = 40 + Math.random() * 30;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const h = getTerrainHeight(x, z);

        // Pilar
        const pillar = new THREE.Mesh(pillarGeo, ruinMat);
        pillar.position.set(x, h + 20, z);
        pillar.rotation.y = Math.random();
        pillar.castShadow = true; pillar.receiveShadow = true;
        scene.add(pillar);

        // Plataforma no topo
        const platform = new THREE.Mesh(platformGeo, ruinMat);
        platform.position.set(x, h + 40, z);
        platform.castShadow = true; platform.receiveShadow = true;
        scene.add(platform);
    }
}

// ==========================================
// ÁGUA E RIO
// ==========================================
function generateRiver() {
    const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);
    
    waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x001a11,
        transparent: true,
        opacity: 0.9,
        roughness: 0.1,
        metalness: 0.9,
        emissive: 0x002211
    });

    const water = new THREE.Mesh(waterGeo, waterMaterial);
    water.position.y = -2.0; // Nível do rio
    water.receiveShadow = true;
    scene.add(water);
}

// ==========================================
// FLORA (PROCEDURAL - OTIMIZADA COM INSTANCEDMESH)
// ==========================================
function generateGiantForest() {
    const count = 200;
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(2, 4, 60, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x120a05, roughness: 1, flatShading: true });
    
    // Copa das árvores gigantes
    const canopyGeo = new THREE.DodecahedronGeometry(15, 1);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x0a1f0a, roughness: 0.9, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
    trunks.castShadow = true; canopies.castShadow = true;

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * (WORLD_SIZE - 40);
        const z = (Math.random() - 0.5) * (WORLD_SIZE - 40);
        const h = getTerrainHeight(x, z);

        // Não nasce no rio
        if (h < 0) continue;

        // Tronco
        dummy.position.set(x, h + 30, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(1, 1 + Math.random() * 0.5, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        // Copa
        dummy.position.set(x, h + 60, z);
        dummy.rotation.set(Math.random(), Math.random(), Math.random());
        dummy.scale.set(1 + Math.random(), 1 + Math.random(), 1 + Math.random());
        dummy.updateMatrix();
        canopies.setMatrixAt(i, dummy.matrix);
    }
    scene.add(trunks, canopies);
}

function generateMidForest() {
    const count = 600;
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.8, 15, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1, flatShading: true });
    
    const leafGeo = new THREE.ConeGeometry(4, 8, 5);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x143814, roughness: 0.9, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    trunks.castShadow = true; leaves.castShadow = true;

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);

        if (h < 0.5) continue;

        dummy.position.set(x, h + 7.5, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(1, 1 + Math.random(), 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, h + 15, z);
        dummy.rotation.set(0, Math.random(), 0);
        dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix);
    }
    scene.add(trunks, leaves);
}

function generateUndergrowth() {
    const count = 2000;
    const dummy = new THREE.Object3D();

    // Samambaias e arbustos
    const fernGeo = new THREE.ConeGeometry(2, 2, 4);
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x2d7a2d, roughness: 1, flatShading: true, side: THREE.DoubleSide });

    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, count);

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);

        if (h < 0) continue;

        dummy.position.set(x, h + 1, z);
        dummy.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI, (Math.random() - 0.5) * 0.8);
        dummy.scale.set(1 + Math.random() * 2, 1 + Math.random() * 1.5, 1 + Math.random() * 2);
        dummy.updateMatrix();
        ferns.setMatrixAt(i, dummy.matrix);
    }
    scene.add(ferns);
}

// ==========================================
// ATMOSFERA (PARTÍCULAS, VAGA-LUMES E RAIOS)
// ==========================================
function generateAmbientParticles() {
    const count = 3000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        pos[i*3] = (Math.random() - 0.5) * WORLD_SIZE;
        pos[i*3+1] = Math.random() * 60;
        pos[i*3+2] = (Math.random() - 0.5) * WORLD_SIZE;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    
    const mat = new THREE.PointsMaterial({
        color: 0x88ffaa,
        size: 0.2,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geo, mat);
    scene.add(particles);
}

function generateFireflies() {
    const count = 500;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        // Vaga-lumes ficam mais perto do chão
        pos[i*3] = (Math.random() - 0.5) * WORLD_SIZE;
        pos[i*3+1] = Math.random() * 15 + 1;
        pos[i*3+2] = (Math.random() - 0.5) * WORLD_SIZE;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    
    const mat = new THREE.PointsMaterial({
        color: 0xffff00,
        size: 0.5,
        transparent: true,
        blending: THREE.AdditiveBlending
    });

    fireflies = new THREE.Points(geo, mat);
    scene.add(fireflies);
}

function generateSkyRays() {
    // Simula os raios de sol (God Rays) com cilindros gigantes semi-transparentes
    const rayMat = new THREE.MeshBasicMaterial({ 
        color: 0xffeebb, 
        transparent: true, 
        opacity: 0.05, 
        side: THREE.DoubleSide,
        depthWrite: false 
    });

    for (let i = 0; i < 20; i++) {
        const rayGeo = new THREE.CylinderGeometry(2 + Math.random()*5, 15, 150, 8, 1, true);
        const ray = new THREE.Mesh(rayGeo, rayMat);
        
        ray.position.set(
            (Math.random() - 0.5) * WORLD_SIZE,
            50,
            (Math.random() - 0.5) * WORLD_SIZE
        );
        ray.rotation.x = Math.PI / 4; // Inclinado como o sol
        ray.rotation.z = Math.PI / 6;
        scene.add(ray);
    }
}

// ==========================================
// CONTROLES DE VOO (DRONE)
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
}

function updateCamera(delta) {
    if (!isGameActive) return;

    const speed = (keys['ShiftLeft'] ? 60 : 25) * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    const moveVec = new THREE.Vector3();
    if (keys['KeyW']) moveVec.add(forward);
    if (keys['KeyS']) moveVec.sub(forward);
    if (keys['KeyD']) moveVec.add(right);
    if (keys['KeyA']) moveVec.sub(right);
    if (keys['Space']) moveVec.add(up);
    if (keys['ControlLeft']) moveVec.sub(up);

    if (moveVec.length() > 0) {
        moveVec.normalize().multiplyScalar(speed);
        camera.position.add(moveVec);
    }
}

// ==========================================
// LOOP DE ANIMAÇÃO
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    if (isGameActive) {
        updateCamera(delta);
    }

    // Animação da água (reflexo/opacidade)
    if (waterMaterial) {
        waterMaterial.opacity = 0.85 + Math.sin(time * 3) * 0.05;
    }

    // Animação dos vaga-lumes
    if (fireflies) {
        const positions = fireflies.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += Math.sin(time * 2 + i) * 0.02;
            if (positions[i + 1] > 20) positions[i + 1] = 1;
        }
        fireflies.geometry.attributes.position.needsUpdate = true;
    }

    composer.render();
}

init();
