import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

// ==========================================
// CONFIGURAÇÕES GLOBAIS DO AMBIENTE
// ==========================================
const WORLD_SIZE = 200;
const WATER_LEVEL = -1.5;
const NOISE_SCALE = 0.015;

let scene, camera, renderer, composer, clock;
let waterMaterial;
let floatingParticles;
let isGameActive = false;
let yaw = 0, pitch = 0;
const keys = {};

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');

const perlin = new ImprovedNoise();
const zOffset = Math.random() * 100;

// ==========================================
// INICIALIZAÇÃO
// ==========================================
function init() {
    scene = new THREE.Scene();
    // Névoa espessa e azulada simulando umidade extrema da selva
    scene.fog = new THREE.FogExp2(0x0a1510, 0.02);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, getTerrainHeight(0, 0) + 2.5, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    clock = new THREE.Clock();

    // Pós-processamento para brilho (Bloom)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.6, 0.85);
    bloomPass.threshold = 0.7;
    bloomPass.strength = 0.6;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    setupLights();
    generateTerrain();
    generateWater();
    generateFlora();
    generateDetails();
    generateAtmosphere();
    setupControls();

    window.addEventListener('resize', onWindowResize);
    overlay.addEventListener('click', () => {
        canvas.requestPointerLock();
    });

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
// 1. ILUMINAÇÃO ATMOSFÉRICA
// ==========================================
function setupLights() {
    // Luz ambiente escura (selva fechada)
    const ambientLight = new THREE.AmbientLight(0x1b3320, 1.5);
    scene.add(ambientLight);

    // Luz hemisférica (céu verde/azulado e chão marrom)
    const hemiLight = new THREE.HemisphereLight(0x2a4a3a, 0x1a1208, 1.0);
    scene.add(hemiLight);

    // Sol (Raios de luz volumétricos falsos)
    const sunLight = new THREE.DirectionalLight(0xffddaa, 4.0);
    sunLight.position.set(40, 60, -30);
    sunLight.castShadow = true;
    
    // Otimização de sombras
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Luzes bioluminescentes espalhadas
    for (let i = 0; i < 10; i++) {
        const pointLight = new THREE.PointLight(0x00ff88, 2, 20);
        pointLight.position.set(
            (Math.random() - 0.5) * WORLD_SIZE,
            Math.random() * 5,
            (Math.random() - 0.5) * WORLD_SIZE
        );
        scene.add(pointLight);
    }
}

// ==========================================
// 2. GERAÇÃO DO TERRENO
// ==========================================
function getTerrainHeight(x, z) {
    let height = perlin.noise(x * NOISE_SCALE, z * NOISE_SCALE, zOffset) * 15;
    height += perlin.noise(x * NOISE_SCALE * 3, z * NOISE_SCALE * 3, zOffset) * 5;
    height += perlin.noise(x * NOISE_SCALE * 8, z * NOISE_SCALE * 8, zOffset) * 1.5;
    
    // Cava um leito de rio no centro do mapa
    const distToRiver = Math.abs(x - Math.sin(z * 0.05) * 20);
    if (distToRiver < 15) {
        const riverFactor = 1 - (distToRiver / 15);
        height -= riverFactor * 10;
    }
    
    return height;
}

function generateTerrain() {
    const canvasSize = 1024;
    const c = document.createElement('canvas');
    c.width = canvasSize; c.height = canvasSize;
    const ctx = c.getContext('2d');
    
    // Base da terra
    ctx.fillStyle = '#24180d'; 
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    
    // Ruído de grama e musgo
    for (let i = 0; i < 80000; i++) {
        const x = Math.random() * canvasSize;
        const y = Math.random() * canvasSize;
        const r = Math.random() * 5;
        const colors = ['#2d4c1e', '#1a330d', '#3b5e28', '#122408'];
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    
    // Folhas secas
    for (let i = 0; i < 20000; i++) {
        ctx.fillStyle = '#4a3018';
        ctx.fillRect(Math.random() * canvasSize, Math.random() * canvasSize, 3, 2);
    }

    const groundTex = new THREE.CanvasTexture(c);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(40, 40);
    groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
    terrainGeo.rotateX(-Math.PI / 2);

    const vertices = terrainGeo.attributes.position.array;
    const colors = [];
    
    const colorLow = new THREE.Color(0x3b2b1a); // Terra úmida
    const colorMid = new THREE.Color(0x1e4014); // Grama
    const colorHigh = new THREE.Color(0x2a5c1a); // Musgo/Vegetação alta

    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        const h = getTerrainHeight(x, z);
        vertices[i + 1] = h; 

        // Coloração baseada na altura
        if (h < WATER_LEVEL + 1) {
            colors.push(colorLow.r, colorLow.g, colorLow.b);
        } else if (h < 5) {
            colors.push(colorMid.r, colorMid.g, colorMid.b);
        } else {
            colors.push(colorHigh.r, colorHigh.g, colorHigh.b);
        }
    }
    
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({ 
        map: groundTex,
        vertexColors: true, // Mistura a textura com as cores de altura
        roughness: 0.95,
        metalness: 0.05
    });

    const terrain = new THREE.Mesh(terrainGeo, groundMat);
    terrain.receiveShadow = true;
    scene.add(terrain);
}

// ==========================================
// 3. ÁGUA (RIO PROCEDURAL)
// ==========================================
function generateWater() {
    const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);
    
    waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a2a1a,
        transparent: true,
        opacity: 0.85,
        roughness: 0.1,
        metalness: 0.8,
        emissive: 0x001105
    });

    const water = new THREE.Mesh(waterGeo, waterMaterial);
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    scene.add(water);
}

// ==========================================
// 4. FLORA (PROCEDURAL E OTIMIZADA)
// ==========================================
function generateFlora() {
    // 4.1 ÁRVORES GIGANTES (Dossel)
    createGiantTrees();
    // 4.2 ÁRVORES MÉDIAS E PALMEIRAS
    createMidTrees();
    // 4.3 SAMAMBAIAS E ARBUSTOS
    createFerns();
}

function createGiantTrees() {
    const count = 150;
    const dummy = new THREE.Object3D();

    // Geometrias e Materiais
    const trunkGeo = new THREE.CylinderGeometry(1.5, 3, 40, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1a110a, roughness: 0.9, flatShading: true });
    const canopyGeo = new THREE.DodecahedronGeometry(12, 1);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x0e2a0e, roughness: 0.8, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
    trunks.castShadow = true; canopies.castShadow = true;
    trunks.receiveShadow = true; canopies.receiveShadow = true;

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * (WORLD_SIZE - 20);
        const z = (Math.random() - 0.5) * (WORLD_SIZE - 20);
        const h = getTerrainHeight(x, z);

        if (h < WATER_LEVEL + 1) continue; // Não nasce na água

        // Tronco
        dummy.position.set(x, h + 20, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(1, 1 + Math.random() * 0.5, 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        // Copa
        dummy.position.set(x, h + 40, z);
        dummy.rotation.set(Math.random(), Math.random(), Math.random());
        dummy.scale.set(1 + Math.random(), 1 + Math.random(), 1 + Math.random());
        dummy.updateMatrix();
        canopies.setMatrixAt(i, dummy.matrix);
    }
    scene.add(trunks, canopies);
}

function createMidTrees() {
    const count = 400;
    const dummy = new THREE.Object3D();

    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, 12, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1, flatShading: true });
    
    const leafGeo = new THREE.ConeGeometry(3, 6, 5);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e571e, roughness: 0.9, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    trunks.castShadow = true; leaves.castShadow = true;

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);

        if (h < WATER_LEVEL) continue;

        dummy.position.set(x, h + 6, z);
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.scale.set(1, 1 + Math.random(), 1);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, h + 12, z);
        dummy.rotation.set(0, Math.random(), 0);
        dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix);
    }
    scene.add(trunks, leaves);
}

function createFerns() {
    const count = 1000;
    const dummy = new THREE.Object3D();

    const fernGeo = new THREE.ConeGeometry(1.5, 1.5, 4);
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x2d7a2d, roughness: 1, flatShading: true });

    const ferns = new THREE.InstancedMesh(fernGeo, fernMat, count);
    
    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);

        if (h < WATER_LEVEL + 0.5) continue;

        dummy.position.set(x, h + 0.75, z);
        dummy.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
        dummy.scale.set(1 + Math.random() * 2, 1 + Math.random(), 1 + Math.random() * 2);
        dummy.updateMatrix();
        ferns.setMatrixAt(i, dummy.matrix);
    }
    ferns.castShadow = true;
    scene.add(ferns);
}

// ==========================================
// 5. DETALHES AMBIENTAIS
// ==========================================
function generateDetails() {
    // 5.1 PEDRAS MUSGOSAS
    const rockCount = 200;
    const dummy = new THREE.Object3D();
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b4a3b, roughness: 1, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);

    for (let i = 0; i < rockCount; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);
        
        dummy.position.set(x, h + 0.5, z);
        dummy.rotation.set(Math.random(), Math.random(), Math.random());
        dummy.scale.set(1 + Math.random() * 3, 1 + Math.random() * 2, 1 + Math.random() * 3);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.castShadow = true; rocks.receiveShadow = true;
    scene.add(rocks);

    // 5.2 CIPÓS (Linhas penduradas)
    const vineMat = new THREE.LineBasicMaterial({ color: 0x1a330d });
    const vineGeo = new THREE.BufferGeometry();
    const vinePositions = [];
    
    for (let i = 0; i < 300; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE;
        const z = (Math.random() - 0.5) * WORLD_SIZE;
        const h = getTerrainHeight(x, z);
        const startY = h + 30 + Math.random() * 10;
        const length = 5 + Math.random() * 15;
        
        // Cria uma linha curva (simplificada)
        for (let j = 0; j < length; j++) {
            if (j === 0) {
                vinePositions.push(x, startY, z);
            } else {
                vinePositions.push(x + Math.sin(j * 0.5) * 0.2, startY - j, z + Math.cos(j * 0.5) * 0.2);
            }
        }
    }
    vineGeo.setAttribute('position', new THREE.Float32BufferAttribute(vinePositions, 3));
    const vines = new THREE.LineSegments(vineGeo, vineMat);
    scene.add(vines);

    // 5.3 COGUMELOS BIOLUMINESCENTES
    const mushroomCount = 50;
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.15, 1, 5);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    const capGeo = new THREE.SphereGeometry(0.4, 6, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const capMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 }); // Brilha com o Bloom

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, mushroomCount);
    const caps = new THREE.InstancedMesh(capGeo, capMat, mushroomCount);

    for (let i = 0; i < mushroomCount; i++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
        const z = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
        const h = getTerrainHeight(x, z);
        
        if (h < WATER_LEVEL + 0.5) continue;

        dummy.position.set(x, h + 0.5, z);
        dummy.scale.set(1, 1 + Math.random(), 1);
        dummy.updateMatrix();
        stems.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, h + 1, z);
        dummy.scale.set(1 + Math.random(), 0.5 + Math.random(), 1 + Math.random());
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
    }
    scene.add(stems, caps);
}

// ==========================================
// 6. ATMOSFERA (PARTÍCULAS E POEIRA)
// ==========================================
function generateAtmosphere() {
    const particleCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * WORLD_SIZE;
        positions[i * 3 + 1] = Math.random() * 40;
        positions[i * 3 + 2] = (Math.random() - 0.5) * WORLD_SIZE;
        velocities.push({
            y: (Math.random() - 0.5) * 0.02,
            x: (Math.random() - 0.5) * 0.02
        });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0x88ffaa,
        size: 0.15,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    floatingParticles = new THREE.Points(geometry, material);
    scene.add(floatingParticles);
}

// ==========================================
// 7. CONTROLES DE VOO LIVRE (NOCLIP)
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

    const speed = (keys['ShiftLeft'] ? 40 : 15) * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    const moveVector = new THREE.Vector3();
    if (keys['KeyW']) moveVector.add(forward);
    if (keys['KeyS']) moveVector.sub(forward);
    if (keys['KeyD']) moveVector.add(right);
    if (keys['KeyA']) moveVector.sub(right);
    if (keys['Space']) moveVector.add(up);
    if (keys['ControlLeft']) moveVector.sub(up);

    if (moveVector.length() > 0) {
        moveVector.normalize().multiplyScalar(speed);
        camera.position.add(moveVector);
    }
}

// ==========================================
// 8. LOOP PRINCIPAL
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    if (isGameActive) {
        updateCamera(delta);
    }

    // Animação da água
    if (waterMaterial) {
        waterMaterial.opacity = 0.8 + Math.sin(time * 2) * 0.05;
    }

    // Animação das partículas flutuantes
    if (floatingParticles) {
        const positions = floatingParticles.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += Math.sin(time + positions[i]) * 0.01;
            positions[i] += Math.cos(time + positions[i + 2]) * 0.005;
        }
        floatingParticles.geometry.attributes.position.needsUpdate = true;
    }

    composer.render();
}

// Inicia o Showcase
init();
