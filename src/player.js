import * as THREE from './lib/three.module.js';

export class Player {
    constructor(camera, scene) {
        this.camera = camera;
        this.scene = scene;

        // Configurações de Movimento
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.moveSpeed = 8.0;
        this.runMultiplier = 1.8;
        this.jumpForce = 8.0;
        this.gravity = 25.0;
        
        // Estado
        this.canJump = true;
        this.isRunning = false;
        this.eyeHeight = 1.6;

        // Rotação (Mouse Look)
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.PI_2 = Math.PI / 2;
        this.pointerSpeed = 0.002;

        // Teclas pressionadas
        this.keys = { w: false, a: false, s: false, d: false, shift: false, space: false };

        this.initControls();
    }

    initControls() {
        // Evento de movimentação do mouse para olhar em volta
        document.addEventListener('mousemove', (event) => {
            if (document.pointerLockElement === document.getElementById('game-canvas')) {
                const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
                const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

                this.euler.setFromQuaternion(this.camera.quaternion);
                this.euler.y -= movementX * this.pointerSpeed;
                this.euler.x -= movementY * this.pointerSpeed;
                this.euler.x = Math.max(-this.PI_2, Math.min(this.PI_2, this.euler.x)); // Limita visão de cima/baixo

                this.camera.quaternion.setFromEuler(this.euler);
            }
        });

        // Teclado
        document.addEventListener('keydown', (event) => {
            switch (event.code) {
                case 'KeyW': this.keys.w = true; break;
                case 'KeyA': this.keys.a = true; break;
                case 'KeyS': this.keys.s = true; break;
                case 'KeyD': this.keys.d = true; break;
                case 'ShiftLeft': this.keys.shift = true; break;
                case 'Space': 
                    if (this.canJump) {
                        this.velocity.y += this.jumpForce;
                        this.canJump = false;
                    }
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch (event.code) {
                case 'KeyW': this.keys.w = false; break;
                case 'KeyA': this.keys.a = false; break;
                case 'KeyS': this.keys.s = false; break;
                case 'KeyD': this.keys.d = false; break;
                case 'ShiftLeft': this.keys.shift = false; break;
            }
        });
    }

    update(delta) {
        // 1. Movimento Horizontal
        this.direction.z = Number(this.keys.w) - Number(this.keys.s);
        this.direction.x = Number(this.keys.d) - Number(this.keys.a);
        this.direction.normalize();

        this.isRunning = this.keys.shift;
        const currentSpeed = this.moveSpeed * (this.isRunning ? this.runMultiplier : 1);

        // Aplica o movimento baseado na direção da câmera (Yaw)
        if (this.keys.w || this.keys.s) {
            this.velocity.z = -(this.direction.z * currentSpeed * delta); 
        } else {
            this.velocity.z = 0;
        }

        if (this.keys.a || this.keys.d) {
            this.velocity.x = (this.direction.x * currentSpeed * delta);
        } else {
            this.velocity.x = 0;
        }

        // 2. Gravidade e Pulo
        this.velocity.y -= this.gravity * delta;

        // Salva a posição antiga para colisão simples
        const oldPos = this.camera.position.clone();

        // Aplica a velocidade (transladando a câmera)
        this.camera.translateX(this.velocity.x);
        this.camera.translateZ(this.velocity.z);
        this.camera.position.y += this.velocity.y * delta;

        // 3. Colisão Básica com o Chão
        if (this.camera.position.y < this.eyeHeight) {
            this.camera.position.y = this.eyeHeight;
            this.velocity.y = 0;
            this.canJump = true;
        }

        // 4. Colisão Simples com Paredes (Limites do Mapa)
        // O mapa tem 100x100 (limites -50 a 50). Vamos deixar uma margem.
        const limit = 48;
        if (this.camera.position.x > limit) this.camera.position.x = limit;
        if (this.camera.position.x < -limit) this.camera.position.x = -limit;
        if (this.camera.position.z > limit) this.camera.position.z = limit;
        if (this.camera.position.z < -limit) this.camera.position.z = -limit;

        // Nota: Para colisão com as paredes internas, seria necessário um sistema de Raycast ou AABB.
        // Nesta V1 inicial, estamos usando colisão de limites e gravidade.
    }
}
