import * as THREE from './lib/three.module.js';
import { createMap } from './map.js';

// Variáveis globais básicas
let scene, camera, renderer, clock;
let isGameActive = false;

// Elementos do HTML
const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');

function init() {
    // 1. Configuração da Cena
    scene = new THREE.Scene();
    
    // Névoa densa cyberpunk (cor azulada escura)
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.05);

    // 2. Configuração da Câmera (Primeira Pessoa)
    camera = new THREE.PerspectiveCamera(
        75, // Campo de visão
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 0); // Altura dos olhos (1.6m)

    // 3. Configuração do Renderizador
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Configurações de sombra e cor
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // 4. Relógio para cálculos de tempo (movimento)
    clock = new THREE.Clock();

    // 5. Iluminação Básica
    setupLights();

    // 6. Carrega o mapa
    createMap(scene);

    // 7. Eventos de janela
    window.addEventListener('resize', onWindowResize);
    
    // 8. Configuração do Pointer Lock (travar o mouse)
    setupPointerLock();

    // Inicia o loop
    animate();
}

function setupLights() {
    // Luz ambiente escura (base)
    const ambientLight = new THREE.AmbientLight(0x111122, 1.5);
    scene.add(ambientLight);

    // Luz direcional fria (simulando luar)
    const dirLight = new THREE.DirectionalLight(0x4466cc, 1.0);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    // Um ponto de luz vermelho de emergência para dar o tom cyberpunk
    const redLight = new THREE.PointLight(0xff0000, 2, 10);
    redLight.position.set(0, 3, -5);
    scene.add(redLight);
}

// --- Lógica do Pointer Lock ---
function setupPointerLock() {
    overlay.addEventListener('click', () => {
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', lockChangeAlert, false);
    document.addEventListener('mozpointerlockchange', lockChangeAlert, false);
}

function lockChangeAlert() {
    if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas) {
        isGameActive = true;
        overlay.style.display = 'none'; // Esconde a tela de início
        clock.getDelta(); // Reseta o relógio para não dar um salto de tempo
    } else {
        isGameActive = false;
        overlay.style.display = 'flex'; // Mostra a tela de início
        overlay.innerHTML = "JOGO PAUSADO<br><span>Clique para continuar</span>";
    }
}

// --- Redimensionamento da Janela ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Loop de Animação ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    // Se o jogo estiver ativo, roda a lógica de atualização
    if (isGameActive) {
        // Aqui futuramente chamaremos: player.update(delta), enemies.update(delta), etc.
    }

    // Renderiza a cena
    renderer.render(scene, camera);
}

// Inicializa o jogo
init();
