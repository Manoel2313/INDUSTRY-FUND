import * as THREE from './lib/three.module.js';

export function createMap(scene) {
    const mapGroup = new THREE.Group();

    // --- MATERIAIS ---
    // Chão metálico escuro
    const floorMat = new THREE.MeshStandardMaterial({ 
        color: 0x222222, 
        roughness: 0.8, 
        metalness: 0.8 
    });
    
    // Paredes de concreto/metal
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x333333, 
        roughness: 0.9, 
        metalness: 0.2 
    });

    // Detalhes neon (ciano)
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    // --- CHÃO E TETO ---
    // Chão principal (100x100)
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    mapGroup.add(floor);

    // Teto
    const ceiling = new THREE.Mesh(floorGeo, wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 5; // Altura do teto
    ceiling.receiveShadow = true;
    mapGroup.add(ceiling);

    // --- PAREDES E CORREDORES ---
    // Função auxiliar para criar paredes
    const createWall = (x, z, width, depth, height = 5) => {
        const geo = new THREE.BoxGeometry(width, height, depth);
        const wall = new THREE.Mesh(geo, wallMat);
        wall.position.set(x, height / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        mapGroup.add(wall);
    };

    // Criando um labirinto simples
    // Paredes externas (perímetro)
    createWall(0, 50, 100, 2);   // Frente
    createWall(0, -50, 100, 2);  // Trás
    createWall(50, 0, 2, 100);   // Direita
    createWall(-50, 0, 2, 100);  // Esquerda

    // Paredes internas (corredores)
    createWall(-10, 10, 2, 20);
    createWall(10, -10, 2, 20);
    createWall(0, -20, 20, 2);
    createWall(-20, 0, 20, 2);
    
    // --- DETALHES: TUBULAÇÕES (Cilindros) ---
    const pipeMat = new THREE.MeshStandardMaterial({ 
        color: 0x555555, 
        roughness: 0.4, 
        metalness: 0.9 
    });

    const createPipe = (x, y, z, length, rotationAxis = 'x') => {
        const geo = new THREE.CylinderGeometry(0.3, 0.3, length, 8);
        const pipe = new THREE.Mesh(geo, pipeMat);
        pipe.position.set(x, y, z);
        
        if (rotationAxis === 'x') pipe.rotation.z = Math.PI / 2;
        if (rotationAxis === 'z') pipe.rotation.x = Math.PI / 2;
        
        pipe.castShadow = true;
        mapGroup.add(pipe);
    };

    // Tubulações no teto
    createPipe(0, 4.5, 15, 30, 'x');
    createPipe(15, 4.5, 0, 30, 'z');
    createPipe(-15, 4.5, -10, 20, 'x');

    // --- DETALHES: LUZES NEON (Emissivas) ---
    // Criando tiras de luz neon nas paredes
    const createNeonStrip = (x, y, z, width, height, depth) => {
        const geo = new THREE.BoxGeometry(width, height, depth);
        const strip = new THREE.Mesh(geo, neonMat);
        strip.position.set(x, y, z);
        mapGroup.add(strip);
    };

    // Tiras de neon nas paredes
    createNeonStrip(-10, 3, 10, 0.1, 0.1, 18); // Corredor esquerdo
    createNeonStrip(10, 3, -10, 0.1, 0.1, 18); // Corredor direito
    createNeonStrip(0, 3, -20, 18, 0.1, 0.1);  // Corredor central

    // Adiciona o grupo do mapa à cena
    scene.add(mapGroup);

    // Retorna os objetos de colisão (para usarmos no player.js futuramente)
    return { mapGroup };
}
