import * as THREE from './lib/three.module.js';
import { createMap } from './map.js';
import { Player } from './player.js';

let scene, camera, renderer, clock;
let player;
let isGameActive = false;

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.05);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Posição inicial (X, Y, Z) - Y é altura. Vamos iniciar em 0, 1.6, 5 para ver as paredes.
    camera.position.set(0, 1.6, 5);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    clock = new THREE.Clock();

    setupLights();
    createMap(scene);
    
    // Inicializa o jogador
    player = new Player(camera, scene);

    window.addEventListener('resize', onWindowResize);
    setupPointerLock();

    animate();
}

function setupLights() {
    const ambientLight = new THREE.AmbientLight(0x111122, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x4466cc, 1.0);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    const redLight = new THREE.PointLight(0xff0000, 2, 10);
    redLight.position.set(0, 3, -5);
    scene.add(redLight);
}

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
        overlay.style.display = 'none';
        clock.getDelta(); 
    } else {
        isGameActive = false;
        overlay.style.display = 'flex';
        overlay.innerHTML = "JOGO PAUSADO<br><span>Clique para continuar</span>";
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1); // Limita o delta para evitar saltos se a aba perder o foco

    if (isGameActive) {
        player.update(delta);
    }

    renderer.render(scene, camera);
}

init();
