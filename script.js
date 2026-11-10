
import * as THREE from "https://esm.sh/three@0.156.1";
import { GLTFLoader } from "https://esm.sh/three@0.156.1/examples/jsm/loaders/GLTFLoader.js";
import { Reflector } from "https://esm.sh/three@0.156.1/examples/jsm/objects/Reflector.js";
import gsap from "https://esm.sh/gsap@3.12.5";

document.addEventListener("DOMContentLoaded", () => {
    new App();
});

class App {
    constructor() {
        this.winWidth = window.innerWidth;
        this.winHeight = window.innerHeight;

        this.gltfFile = "https://assets.codepen.io/264161/rabbit6.glb";

        this.bgrColor = 0x332e2e;
        this.floorSize = 30;

        this.loadAssets();
    }

    // ==============================
    // LOAD MODEL
    // ==============================

    loadAssets() {
        const loaderModel = new GLTFLoader();

        loaderModel.load(
            this.gltfFile,

            (gltf) => {
                this.model = gltf.scene;
                this.setUpScene();
            },

            undefined,

            (error) => {
                console.error("Ошибка загрузки 3D-модели:", error);
                document.getElementById("instructions").textContent =
                    "Unable to load 3D model";
            }
        );
    }

    // ==============================
    // SCENE SETUP
    // ==============================

    setUpScene() {
        this.scene = new THREE.Scene();

        this.fog = new THREE.Fog(this.bgrColor, 13, 20);
        this.scene.fog = this.fog;

        this.camera = new THREE.PerspectiveCamera(
            60,
            this.winWidth / this.winHeight,
            1,
            100
        );

        this.camera.position.set(0, 4, 8);
        this.camera.lookAt(new THREE.Vector3());

        this.scene.add(this.camera);

        // Hero parameters

        this.heroAngularSpeed = 0;
        this.heroOldRot = 0;
        this.heroDistance = 0;

        this.heroOldUVPos = new THREE.Vector2(0.5, 0.5);
        this.heroNewUVPos = new THREE.Vector2(0.5, 0.5);

        this.heroSpeed = new THREE.Vector2(0, 0);
        this.heroAcc = new THREE.Vector2(0, 0);

        this.targetHeroUVPos = new THREE.Vector2(0.5, 0.5);
        this.targetHeroAbsMousePos = new THREE.Vector2(0, 0);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.isJumping = false;
        this.isLanding = false;
        this.isExploding = false;

        this.jumpParams = {
            jumpProgress: 0,
            landProgress: 0
        };

        // Clock

        this.clock = new THREE.Clock();
        this.time = 0;
        this.deltaTime = 0;

        // Core

        this.createRenderer();
        this.createSim();
        this.createListeners();

        // Environment

        this.createMaterials();
        this.processModel();
        this.createFloor();
        this.createLine();
        this.createLight();
        this.createParticles();

        // Start

        this.draw();
    }

    // ==============================
    // PROCESS RABBIT MODEL
    // ==============================

    processModel() {
        this.rabbit = this.model.getObjectByName("Rabbit");

        this.rabbitBody = this.model.getObjectByName("body");

        this.earRight = this.model.getObjectByName("earRight");
        this.earLeft = this.model.getObjectByName("earLeft");

        this.tail = this.model.getObjectByName("tail");

        this.footLeft = this.model.getObjectByName("footLeft");
        this.footRight = this.model.getObjectByName("footRight");

        this.eyeLeft = this.model.getObjectByName("eyeLeft");
        this.eyeRight = this.model.getObjectByName("eyeRight");

        this.carrot = this.model.getObjectByName("carrot");

        this.carrotLeaf = this.model.getObjectByName("carrotLeaf");
        this.carrotLeaf2 = this.model.getObjectByName("carrotLeaf2");

        // Check model structure

        const requiredObjects = [
            this.rabbit,
            this.rabbitBody,
            this.earRight,
            this.earLeft,
            this.tail,
            this.footLeft,
            this.footRight,
            this.eyeLeft,
            this.eyeRight,
            this.carrot,
            this.carrotLeaf,
            this.carrotLeaf2
        ];

        if (requiredObjects.some(object => !object)) {
            throw new Error(
                "Не найдены необходимые объекты внутри GLB-модели"
            );
        }

        // Carrot rotation

        this.carrot.rotation.z = 0.2;
        this.carrot.rotation.x = 0.2;

        // Materials

        this.rabbitBody.material = this.primMat;

        this.earRight.material = this.primMat;
        this.earLeft.material = this.primMat;

        this.tail.material = this.primMat;

        this.footLeft.material = this.secMat;
        this.footRight.material = this.secMat;

        this.eyeLeft.material = this.secMat;
        this.eyeRight.material = this.secMat;

        this.carrot.material = this.bonusMat;

        this.carrotLeaf.material = this.primMat;
        this.carrotLeaf2.material = this.primMat;

        // Black outlines

        this.addOutline(this.rabbitBody);
        this.addOutline(this.earRight);
        this.addOutline(this.earLeft);
        this.addOutline(this.tail);
        this.addOutline(this.carrot);

        // Shadows

        this.rabbit.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });

        this.carrot.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
            }
        });

        this.scene.add(this.rabbit);
        this.scene.add(this.carrot);
    }

    // ==============================
    // FLOOR
    // ==============================

    createFloor() {
        this.floor = new Reflector(
            new THREE.PlaneGeometry(
                this.floorSize,
                this.floorSize
            ),
            {
                color: new THREE.Color(this.bgrColor),
                textureWidth: 1024,
                textureHeight: 1024
            }
        );

        this.floor.rotation.x = -Math.PI / 2;

        this.floor.receiveShadow = true;

        this.modifyFloorShader();

        this.scene.add(this.floor);
    }

    // ==============================
    // MOVEMENT LINE
    // ==============================

    createLine() {
        const material = new THREE.LineDashedMaterial({
            color: 0x7beeff,
            linewidth: 1,
            scale: 1,
            dashSize: 0.2,
            gapSize: 0.1
        });

        const points = [];

        points.push(new THREE.Vector3(0, 0.2, 0));
        points.push(new THREE.Vector3(3, 0.2, 3));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        this.line = new THREE.Line(geometry, material);

        this.scene.add(this.line);
    }

    // ==============================
    // PARTICLES
    // ==============================

    createParticles() {
        const bodyCount = 20;
        const tailCount = 5;

        const particleGeom = new THREE.BoxGeometry(
            0.2,
            0.2,
            0.2,
            1,
            1,
            1
        );

        this.particles1 = [];
        this.particles2 = [];

        for (let i = 0; i < bodyCount; i++) {
            const mesh = new THREE.Mesh(
                particleGeom,
                this.bonusMat
            );

            this.particles1.push(mesh);

            mesh.scale.set(0, 0, 0);

            this.scene.add(mesh);
        }

        for (let i = 0; i < tailCount; i++) {
            const mesh = new THREE.Mesh(
                particleGeom,
                this.primMat
            );

            this.particles2.push(mesh);

            mesh.scale.set(0, 0, 0);

            this.scene.add(mesh);
        }
    }

    // ==============================
    // LIGHTING
    // ==============================

    createLight() {
        this.ambientLight = new THREE.AmbientLight(0xffffff);

        this.scene.add(this.ambientLight);

        this.light = new THREE.DirectionalLight(0xffffff, 1);

        this.light.position.set(1, 5, 1);

        this.light.castShadow = true;

        this.light.shadow.mapSize.width = 512;
        this.light.shadow.mapSize.height = 512;

        this.light.shadow.camera.near = 0.5;
        this.light.shadow.camera.far = 12;

        this.light.shadow.camera.left = -12;
        this.light.shadow.camera.right = 12;

        this.light.shadow.camera.bottom = -12;
        this.light.shadow.camera.top = 12;

        this.light.shadow.radius = 3;
        this.light.shadow.blurSamples = 4;

        this.scene.add(this.light);
    }

    // ==============================
    // RENDERER
    // ==============================

    createRenderer() {
        const canvas = document.querySelector("canvas.webgl");

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            preserveDrawingBuffer: true
        });

        this.renderer.setClearColor(
            new THREE.Color(this.bgrColor)
        );

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );

        this.renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        this.renderer.toneMapping = THREE.LinearToneMapping;

        this.renderer.toneMappingExposure = 1;

        this.renderer.shadowMap.enabled = true;

        this.renderer.shadowMap.type = THREE.VSMShadowMap;

        this.renderer.localClippingEnabled = true;
    }

    // ==============================
    // SIMULATION
    // ==============================

    createSim() {
        const fragmentShader = document
            .getElementById("simulationFragmentShader")
            .textContent;

        const vertexShader = document
            .getElementById("simulationVertexShader")
            .textContent;

        this.floorSimMat = new THREE.ShaderMaterial({
            uniforms: {
                inputTexture: {
                    type: "t",
                    value: null
                },

                time: {
                    value: 0.0
                },

                blade1PosOld: {
                    value: new THREE.Vector2(0.5, 0.5)
                },

                blade1PosNew: {
                    value: new THREE.Vector2(0.5, 0.5)
                },

                strength: {
                    value: 0.0
                }
            },

            vertexShader,
            fragmentShader
        });

        this.bufferSim = new BufferSim(
            this.renderer,
            1024,
            1024,
            this.floorSimMat
        );
    }

    // ==============================
    // MATERIALS
    // ==============================

    createMaterials() {
        this.primMat = new THREE.MeshToonMaterial({
            color: 0x7beeff
        });

        this.secMat = new THREE.MeshToonMaterial({
            color: this.bgrColor
        });

        this.bonusMat = new THREE.MeshToonMaterial({
            color: 0xff3434
        });

        // Outline material

        const fragmentShader = document
            .getElementById("outlineFragmentShader")
            .textContent;

        const vertexShader = document
            .getElementById("outlineVertexShader")
            .textContent;

        this.outlineMat = new THREE.ShaderMaterial({
            uniforms: {
                color: {
                    value: new THREE.Color(0x000000)
                },

                size: {
                    type: "f",
                    value: 0.02
                },

                time: {
                    value: 0
                }
            },

            vertexShader,
            fragmentShader,

            side: THREE.BackSide
        });
    }

    // ==============================
    // OUTLINE
    // ==============================

    addOutline(origin) {
        const outline = origin.clone();

        outline.children = [];

        outline.position.set(0, 0, 0);

        outline.rotation.set(0, 0, 0);

        outline.scale.set(1, 1, 1);

        outline.material = this.outlineMat;

        origin.add(outline);

        return outline;
    }

    // ==============================
    // EVENT LISTENERS
    // ==============================

    createListeners() {
        window.addEventListener(
            "resize",
            this.onWindowResize.bind(this)
        );

        document.addEventListener(
            "mousemove",
            this.onMouseMove.bind(this),
            false
        );

        document.addEventListener(
            "touchmove",
            this.onTouchMove.bind(this),
            { passive: false }
        );

        document.addEventListener(
            "mousedown",
            this.onMouseDown.bind(this),
            false
        );

        document.addEventListener(
            "touchstart",
            this.onTouchStart.bind(this),
            { passive: true }
        );
    }

    // ==============================
    // MAIN RENDER LOOP
    // ==============================

    draw() {
        this.updateGame();

        this.renderer.render(
            this.scene,
            this.camera
        );

        if (this.controls) {
            this.controls.update();
        }

        window.requestAnimationFrame(
            this.draw.bind(this)
        );
    }

    // ==============================
    // GAME UPDATE
    // ==============================

    updateGame() {
        this.dt = Math.min(
            this.clock.getDelta(),
            0.3
        );

        this.time += this.dt;

        this.floorSimMat.uniforms.time.value = this.time;

        this.outlineMat.uniforms.time.value = this.time;

        if (this.rabbit && this.line) {

            // Constrain mouse position

            const constrainUVPosX = this.constrain(
                this.targetHeroUVPos.x - 0.5,
                -0.3,
                0.3
            );

            const constrainUVPosY = this.constrain(
                this.targetHeroUVPos.y - 0.5,
                -0.3,
                0.3
            );

            this.targetHeroAbsMousePos.x =
                constrainUVPosX * this.floorSize;

            this.targetHeroAbsMousePos.y =
                -constrainUVPosY * this.floorSize;

            // Movement physics

            const dx =
                this.targetHeroAbsMousePos.x -
                this.rabbit.position.x;

            const dy =
                this.targetHeroAbsMousePos.y -
                this.rabbit.position.z;

            const angle = Math.atan2(dy, dx);

            this.heroDistance = Math.sqrt(
                dx * dx + dy * dy
            );

            const ax = dx * this.dt * 0.5;
            const ay = dy * this.dt * 0.5;

            this.heroSpeed.x += ax;
            this.heroSpeed.y += ay;

            this.heroSpeed.x *= Math.pow(this.dt, 0.005);
            this.heroSpeed.y *= Math.pow(this.dt, 0.005);

            this.rabbit.position.x += this.heroSpeed.x;
            this.rabbit.position.z += this.heroSpeed.y;

            const targetRot = -angle + Math.PI / 2;

            if (this.heroDistance > 0.3) {
                this.rabbit.rotation.y +=
                    this.getShortestAngle(
                        targetRot - this.rabbit.rotation.y
                    ) * 3 * this.dt;
            }

            this.heroAngularSpeed = this.getShortestAngle(
                this.rabbit.rotation.y - this.heroOldRot
            );

            this.heroOldRot = this.rabbit.rotation.y;

            // Ear animation

            if (!this.isJumping) {
                this.earLeft.rotation.x =
                    this.earRight.rotation.x =
                    -this.heroSpeed.length() * 2;
            }

            // Movement line

            const p = this.line.geometry.attributes.position.array;

            p[0] = this.targetHeroAbsMousePos.x;
            p[2] = this.targetHeroAbsMousePos.y;

            p[3] = this.rabbit.position.x;
            p[4] = this.rabbit.position.y;
            p[5] = this.rabbit.position.z;

            this.line.geometry.attributes.position.needsUpdate = true;

            this.line.computeLineDistances();

            // Rabbit UV position

            this.heroNewUVPos = new THREE.Vector2(
                0.5 + this.rabbit.position.x / this.floorSize,
                0.5 - this.rabbit.position.z / this.floorSize
            );

            // Floor simulation

            this.floorSimMat.uniforms.blade1PosNew.value =
                this.heroNewUVPos;

            this.floorSimMat.uniforms.blade1PosOld.value =
                this.heroOldUVPos;

            this.floorSimMat.uniforms.strength.value =
                this.isJumping
                    ? 0
                    : 1 / (1 + this.heroSpeed.length() * 10);

            this.bufferSim.render();

            this.renderer.setRenderTarget(null);

            this.floor.material.uniforms.tScratches.value =
                this.bufferSim.output.texture;

            this.heroOldUVPos = this.heroNewUVPos.clone();

            // Carrot rotation

            this.carrot.rotation.y += this.dt;

            // Collision

            this.testCollision();
        }
    }

    // ==============================
    // WINDOW RESIZE
    // ==============================

    onWindowResize() {
        this.winWidth = window.innerWidth;
        this.winHeight = window.innerHeight;

        this.camera.aspect =
            this.winWidth / this.winHeight;

        this.camera.updateProjectionMatrix();

        this.renderer.setSize(
            this.winWidth,
            this.winHeight
        );

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );
    }

    // ==============================
    // MOUSE MOVEMENT
    // ==============================

    onMouseMove(event) {
        const x =
            event.clientX / this.winWidth * 2 - 1;

        const y =
            -(event.clientY / this.winHeight * 2 - 1);

        this.updateMouse(x, y);
    }

    // ==============================
    // TOUCH MOVEMENT
    // ==============================

    onTouchMove(event) {
        if (event.touches.length === 1) {
            event.preventDefault();

            const x =
                event.touches[0].pageX /
                this.winWidth * 2 - 1;

            const y =
                -(event.touches[0].pageY /
                this.winHeight * 2 - 1);

            this.updateMouse(x, y);
        }
    }

    // ==============================
    // TOUCH START
    // ==============================

    onTouchStart() {
        if (this.rabbit && !this.isJumping) {
            this.jump();
        }
    }

    // ==============================
    // UPDATE MOUSE
    // ==============================

    updateMouse(x, y) {
        this.mouse.x = x;
        this.mouse.y = y;

        if (this.floor) {
            this.raycast();
        }
    }

    // ==============================
    // MOUSE CLICK
    // ==============================

    onMouseDown() {
        if (this.rabbit && !this.isJumping) {
            this.jump();
        }
    }

    // ==============================
    // JUMP ANIMATION
    // ==============================

    jump() {
        if (!this.rabbit || this.isJumping) return;

        this.isJumping = true;

        const turns =
            Math.floor(this.heroSpeed.length() * 5) + 1;

        const jumpDuration =
            0.5 + turns * 0.2;

        const targetRot =
            this.heroAngularSpeed > 0
                ? Math.PI * 2 * turns
                : -Math.PI * 2 * turns;

        // Body rotation

        gsap.to(this.rabbitBody.rotation, {
            duration: jumpDuration,
            ease: "none",
            y: targetRot,

            onComplete: () => {
                this.rabbitBody.rotation.y = 0;
            }
        });

        // Ears animation

        gsap.to(
            [
                this.earLeft.rotation,
                this.earRight.rotation
            ],
            {
                duration: jumpDuration * 0.8,
                ease: "power4.out",
                x: Math.PI / 4
            }
        );

        gsap.to(
            [
                this.earLeft.rotation,
                this.earRight.rotation
            ],
            {
                duration: jumpDuration * 0.2,
                delay: jumpDuration * 0.8,
                ease: "power4.in",
                x: 0
            }
        );

        // Jump up

        gsap.to(this.jumpParams, {
            duration: jumpDuration * 0.5,
            ease: "power2.out",

            jumpProgress: 0.5,

            onUpdate: () => {
                const sin = Math.sin(
                    this.jumpParams.jumpProgress * Math.PI
                );

                this.rabbit.position.y =
                    Math.pow(sin, 4) * turns;
            }
        });

        // Landing

        gsap.to(this.jumpParams, {
            duration: jumpDuration * 0.5,
            ease: "power2.in",

            delay: jumpDuration * 0.5,

            jumpProgress: 1,

            onUpdate: () => {
                const sin = Math.sin(
                    this.jumpParams.jumpProgress * Math.PI
                );

                this.rabbit.position.y =
                    Math.pow(sin, 1) * turns;
            },

            onComplete: () => {
                this.rabbit.position.y = 0;

                this.jumpParams.jumpProgress = 0;

                this.isJumping = false;
            }
        });
    }

    // ==============================
    // RAYCAST
    // ==============================

    raycast() {
        this.raycaster.setFromCamera(
            this.mouse,
            this.camera
        );

        const intersects =
            this.raycaster.intersectObjects([
                this.floor
            ]);

        if (intersects.length > 0) {
            this.targetHeroUVPos.x =
                intersects[0].uv.x;

            this.targetHeroUVPos.y =
                intersects[0].uv.y;
        }
    }

    // ==============================
    // ANGLE CALCULATION
    // ==============================

    getShortestAngle(v) {
        let a = v % (Math.PI * 2);

        if (a < -Math.PI) {
            a += Math.PI * 2;
        } else if (a > Math.PI) {
            a -= Math.PI * 2;
        }

        return a;
    }

    // ==============================
    // CONSTRAIN
    // ==============================

    constrain(v, vMin, vMax) {
        return Math.min(
            vMax,
            Math.max(vMin, v)
        );
    }

    // ==============================
    // COLLISION DETECTION
    // ==============================

    testCollision() {
        if (this.isExploding || !this.carrot.visible) {
            return;
        }

        const distVec =
            this.rabbit.position.clone();

        distVec.sub(this.carrot.position);

        const distance = distVec.length();

        if (distance <= 1) {
            this.carrot.visible = false;

            this.explode(this.carrot.position);
        }
    }

    // ==============================
    // EXPLOSION
    // ==============================

    explode(pos) {
        if (this.isExploding) return;

        this.isExploding = true;

        const allParticles = [
            ...this.particles1,
            ...this.particles2
        ];

        let completedParticles = 0;

        const totalParticles = allParticles.length;

        allParticles.forEach((mesh) => {

            mesh.position.copy(pos);

            mesh.scale.set(2, 2, 2);

            // Particle movement

            gsap.to(mesh.position, {
                x: pos.x + (-0.5 + Math.random()) * 1.5,

                y: pos.y + (0.5 + Math.random()) * 1.5,

                z: pos.z + (-0.5 + Math.random()) * 1.5,

                duration: 1,

                ease: "power4.out"
            });

            // Particle disappearance

            gsap.to(mesh.scale, {
                x: 0,
                y: 0,
                z: 0,

                duration: 1,

                ease: "power4.out",

                onComplete: () => {
                    completedParticles++;

                    // Spawn only once

                    if (completedParticles === totalParticles) {
                        this.spawnCarrot();

                        this.isExploding = false;
                    }
                }
            });

        });
    }

    // ==============================
    // SPAWN NEW CARROT
    // ==============================

    spawnCarrot() {
        const px = (Math.random() - 0.5) * 0.3;

        const py = (Math.random() - 0.5) * 0.3;

        const h = 0.2 + Math.random() * 1;

        this.carrot.position.x =
            px * this.floorSize;

        this.carrot.position.z =
            py * this.floorSize;

        this.carrot.position.y = -1;

        this.carrot.scale.set(0, 0, 0);

        this.carrot.visible = true;

        // Scale animation

        gsap.to(this.carrot.scale, {
            duration: 1.5,

            ease: "elastic.out",

            x: 1,
            y: 1,
            z: 1
        });

        // Position animation

        gsap.to(this.carrot.position, {
            duration: 1.5,

            ease: "elastic.out",

            y: h
        });
    }

    // ==============================
    // MODIFY REFLECTOR SHADER
    // ==============================

    modifyFloorShader() {

        const renderTarget =
            this.floor.getRenderTarget();

        const textureMatrix =
            this.floor.material.uniforms.textureMatrix;

        const fragmentShader = document
            .getElementById("reflectorFragmentShader")
            .textContent;

        const vertexShader = document
            .getElementById("reflectorVertexShader")
            .textContent;

        // Merge uniforms

        const uniforms = THREE.UniformsUtils.merge([
            THREE.UniformsLib["common"],
            THREE.UniformsLib["shadowmap"],
            THREE.UniformsLib["lights"],
            this.floor.material.uniforms,

            {
                tScratches: {
                    value: this.bufferSim.output.texture
                }
            }
        ]);

        // Apply custom shader

        this.floor.material.lights = true;

        this.floor.material.uniforms = uniforms;

        this.floor.material.uniforms.tDiffuse.value =
            renderTarget.texture;

        this.floor.material.uniforms.textureMatrix.value =
            textureMatrix.value;

        this.floor.material.vertexShader =
            vertexShader;

        this.floor.material.fragmentShader =
            fragmentShader;

        this.floor.material.needsUpdate = true;
    }
}

// ==================================
// BUFFER SIMULATION CLASS
// ==================================

class BufferSim {

    constructor(renderer, width, height, shader) {

        this.renderer = renderer;

        this.shader = shader;

        this.orthoScene = new THREE.Scene();

        // Frame buffer

        const fbo = new THREE.WebGLRenderTarget(
            width,
            height,
            {
                wrapS: THREE.ClampToEdgeWrapping,

                wrapT: THREE.ClampToEdgeWrapping,

                minFilter: THREE.LinearFilter,

                magFilter: THREE.LinearFilter,

                format: THREE.RGBAFormat,

                type: THREE.FloatType,

                stencilBuffer: false,

                depthBuffer: false
            }
        );

        fbo.texture.generateMipmaps = false;

        this.fbos = [
            fbo,
            fbo.clone()
        ];

        this.current = 0;

        this.output = this.fbos[0];

        // Orthographic camera

        this.orthoCamera = new THREE.OrthographicCamera(
            width / -2,
            width / 2,
            height / 2,
            height / -2,
            0.00001,
            1000
        );

        // Simulation plane

        this.orthoQuad = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            this.shader
        );

        this.orthoScene.add(this.orthoQuad);
    }

    // ==============================
    // RENDER SIMULATION
    // ==============================

    render() {

        this.shader.uniforms.inputTexture.value =
            this.fbos[this.current].texture;

        this.input = this.fbos[this.current];

        this.current = 1 - this.current;

        this.output = this.fbos[this.current];

        this.renderer.setRenderTarget(this.output);

        this.renderer.render(
            this.orthoScene,
            this.orthoCamera
        );

        this.renderer.setRenderTarget(null);
    }
}
