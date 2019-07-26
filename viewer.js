window.onload = (() => {

    THREE.DRACOLoader.setDecoderPath('lib/draco/');

    const DEFAULT_CAMERA = '[default]';

// glTF texture types. `envMap` is deliberately omitted, as it's used internally
// by the loader but not part of the glTF format.
    const MAP_NAMES = [
        'map',
        'aoMap',
        'emissiveMap',
        'glossinessMap',
        'metalnessMap',
        'normalMap',
        'roughnessMap',
        'specularMap',
    ];

    const Preset = {ASSET_GENERATOR: 'assetgenerator'};

    class Viewer {
        constructor(el, options) {
            this.el = el;
            this.options = options;

            this.lights = [];
            this.content = null;
            this.mixer = null;
            this.clips = [];

            this.state = {
                environment: options.preset === Preset.ASSET_GENERATOR
                    ? 'Footprint Court (HDR)'
                    : environments[1].name,
                background: false,
                playbackSpeed: 1.0,
                actionStates: {},
                camera: DEFAULT_CAMERA,
                wireframe: false,
                skeleton: false,
                grid: false,

                // Lights
                addLights: true,
                exposure: 1.0,
                textureEncoding: 'sRGB',
                ambientIntensity: 0.3,
                ambientColor: 0xFFFFFF,
                directIntensity: 0.8 * Math.PI, // TODO(#116)
                directColor: 0xFFFFFF,
                bgColor1: '#ffffff',
                bgColor2: '#353535'
            };

            this.prevTime = 0;

            this.scene = new THREE.Scene();

            const fov = options.preset === Preset.ASSET_GENERATOR
                ? 0.8 * 180 / Math.PI
                : 60;
            this.defaultCamera = new THREE.PerspectiveCamera(fov, el.clientWidth / el.clientHeight, 0.01, 1000);
            this.activeCamera = this.defaultCamera;
            this.scene.add(this.defaultCamera);

            this.renderer = new THREE.WebGLRenderer({antialias: true});
            this.renderer.physicallyCorrectLights = true;
            this.renderer.gammaOutput = true;
            this.renderer.gammaFactor = 2.2;
            this.renderer.setClearColor(0xcccccc);
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(el.clientWidth, el.clientHeight);

            this.controls = new THREE.OrbitControls(this.defaultCamera, this.renderer.domElement);
            this.controls.autoRotate = false;
            this.controls.autoRotateSpeed = -10;
            this.controls.screenSpacePanning = true;

            this.el.appendChild(this.renderer.domElement);

            this.cameraCtrl = null;
            this.cameraFolder = null;
            this.animFolder = null;
            this.animCtrls = [];
            this.morphFolder = null;
            this.morphCtrls = [];
            this.skeletonHelpers = [];
            this.gridHelper = null;
            this.axesHelper = null;

            this.animate = this.animate.bind(this);
            requestAnimationFrame(this.animate);
            window.addEventListener('resize', this.resize.bind(this), false);
        }

        animate(time) {

            requestAnimationFrame(this.animate);

            const dt = (time - this.prevTime) / 1000;

            this.controls.update();
            this.mixer && this.mixer.update(dt);
            this.render();

            this.prevTime = time;

        }

        render() {

            this.renderer.render(this.scene, this.activeCamera);

        }

        resize() {

            const {clientHeight, clientWidth} = this.renderer.parentElement;

            this.defaultCamera.aspect = clientWidth / clientHeight;
            this.defaultCamera.updateProjectionMatrix();
            this.renderer.setSize(clientWidth, clientHeight);

        }

        load(url, rootPath, assetMap) {
            return new Promise((resolve, reject) => {
                let loader = new THREE.GLTFLoader();
                loader.load(
                    // resource URL
                    url,
                    // called when the resource is loaded
                    (gltf) => {
                        const scene = gltf.scene || gltf.scenes[0];
                        const clips = gltf.animations || [];
                        this.setContent(scene, clips);

                        this.playAllClips();

                        resolve(gltf);
                        // if (onLoad) {
                        //     onLoad(gltf);
                        // }
                    },
                    // called while loading is progressing
                    (xhr) => {
                        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                        // if (onProgress) {
                        //     onProgress(xhr);
                        // }
                    },
                    // called when loading has errors
                    (error) => {
                        console.log('An error happened', error);
                        // if (onError) {
                        //     onError(error);
                        // }
                    }
                );
            });


            const baseURL = THREE.LoaderUtils.extractUrlBase(url);

            // Load.
            return new Promise((resolve, reject) => {

                const manager = new THREE.LoadingManager();

                // Intercept and override relative URLs.
                manager.setURLModifier((url, path) => {

                    const normalizedURL = rootPath + url
                        .replace(baseURL, '')
                        .replace(/^(\.?\/)/, '');

                    if (assetMap.has(normalizedURL)) {
                        const blob = assetMap.get(normalizedURL);
                        const blobURL = URL.createObjectURL(blob);
                        blobURLs.push(blobURL);
                        return blobURL;
                    }

                    return (path || '') + url;

                });

                const loader = new THREE.GLTFLoader(manager);
                loader.setCrossOrigin('anonymous');
                loader.setDRACOLoader(new THREE.DRACOLoader());
                const blobURLs = [];

                loader.load(url, (gltf) => {

                    const scene = gltf.scene || gltf.scenes[0];
                    const clips = gltf.animations || [];
                    this.setContent(scene, clips);

                    blobURLs.forEach(URL.revokeObjectURL);

                    // See: https://github.com/google/draco/issues/349
                    // THREE.DRACOLoader.releaseDecoderModule();

                    resolve(gltf);

                }, undefined, reject);

            });

        }

        /**
         * @param {THREE.Object3D} object
         * @param {Array<THREE.AnimationClip} clips
         */
        setContent(object, clips) {

            this.clear();

            const box = new THREE.Box3().setFromObject(object);
            const size = box.getSize(new THREE.Vector3()).length();
            const center = box.getCenter(new THREE.Vector3());

            this.controls.reset();

            object.position.x += (object.position.x - center.x);
            object.position.y += (object.position.y - center.y);
            object.position.z += (object.position.z - center.z);
            this.controls.maxDistance = size * 10;
            this.defaultCamera.near = size / 100;
            this.defaultCamera.far = size * 100;
            this.defaultCamera.updateProjectionMatrix();

            if (this.options.cameraPosition) {

                this.defaultCamera.position.fromArray(this.options.cameraPosition);
                this.defaultCamera.lookAt(new THREE.Vector3());

            } else {

                this.defaultCamera.position.copy(center);
                this.defaultCamera.position.x += size / 2.0;
                this.defaultCamera.position.y += size / 5.0;
                this.defaultCamera.position.z += size / 2.0;
                this.defaultCamera.lookAt(center);

            }

            this.setCamera(DEFAULT_CAMERA);

            this.controls.saveState();

            this.scene.add(object);
            this.content = object;

            this.state.addLights = true;
            this.content.traverse((node) => {
                if (node.isLight) {
                    this.state.addLights = false;
                }
            });

            this.setClips(clips);

            this.updateLights();
            this.updateEnvironment();
            this.updateTextureEncoding();
            this.updateDisplay();

            window.content = this.content;
            console.info('[glTF Viewer] THREE.Scene exported as `window.content`.');
            this.printGraph(this.content);

        }

        printGraph(node) {

            console.group(' <' + node.type + '> ' + node.name);
            node.children.forEach((child) => this.printGraph(child));
            console.groupEnd();

        }

        /**
         * @param {Array<THREE.AnimationClip} clips
         */
        setClips(clips) {
            if (this.mixer) {
                this.mixer.stopAllAction();
                this.mixer.uncacheRoot(this.mixer.getRoot());
                this.mixer = null;
            }

            this.clips = clips;
            if (!clips.length) return;

            this.mixer = new THREE.AnimationMixer(this.content);
        }

        playAllClips() {
            this.clips.forEach((clip) => {
                this.mixer.clipAction(clip).reset().play();
                this.state.actionStates[clip.name] = true;
            });
        }

        /**
         * @param {string} name
         */
        setCamera(name) {
            if (name === DEFAULT_CAMERA) {
                this.controls.enabled = true;
                this.activeCamera = this.defaultCamera;
            } else {
                this.controls.enabled = false;
                this.content.traverse((node) => {
                    if (node.isCamera && node.name === name) {
                        this.activeCamera = node;
                    }
                });
            }
        }

        updateTextureEncoding() {
            const encoding = this.state.textureEncoding === 'sRGB'
                ? THREE.sRGBEncoding
                : THREE.LinearEncoding;
            this.traverseMaterials(this.content, (material) => {
                if (material.map) material.map.encoding = encoding;
                if (material.emissiveMap) material.emissiveMap.encoding = encoding;
                if (material.map || material.emissiveMap) material.needsUpdate = true;
            });
        }

        updateLights() {
            const state = this.state;
            const lights = this.lights;

            if (state.addLights && !lights.length) {
                this.addLights();
            } else if (!state.addLights && lights.length) {
                this.removeLights();
            }

            this.renderer.toneMappingExposure = state.exposure;

            if (lights.length === 2) {
                lights[0].intensity = state.ambientIntensity;
                lights[0].color.setHex(state.ambientColor);
                lights[1].intensity = state.directIntensity;
                lights[1].color.setHex(state.directColor);
            }
        }

        addLights() {
            const state = this.state;

            if (this.options.preset === Preset.ASSET_GENERATOR) {
                const hemiLight = new THREE.HemisphereLight();
                hemiLight.name = 'hemi_light';
                this.scene.add(hemiLight);
                this.lights.push(hemiLight);
                return;
            }

            const light1 = new THREE.AmbientLight(state.ambientColor, state.ambientIntensity);
            light1.name = 'ambient_light';
            this.defaultCamera.add(light1);

            const light2 = new THREE.DirectionalLight(state.directColor, state.directIntensity);
            light2.position.set(0.5, 0, 0.866); // ~60º
            light2.name = 'main_light';
            this.defaultCamera.add(light2);

            this.lights.push(light1, light2);
        }

        removeLights() {

            this.lights.forEach((light) => light.parent.remove(light));
            this.lights.length = 0;

        }

        updateEnvironment() {

            const environment = environments.filter((entry) => entry.name === this.state.environment)[0];

            this.getCubeMapTexture(environment).then(({envMap, cubeMap}) => {
                this.traverseMaterials(this.content, (material) => {
                    if (material.isMeshStandardMaterial || material.isGLTFSpecularGlossinessMaterial) {
                        material.envMap = envMap;
                        material.needsUpdate = true;
                    }
                });
            });

        }

        getCubeMapTexture(environment) {
            const {path, format} = environment;

            // no envmap
            if (!path) return Promise.resolve({envMap: null, cubeMap: null});

            const cubeMapURLs = [
                path + 'posx' + format, path + 'negx' + format,
                path + 'posy' + format, path + 'negy' + format,
                path + 'posz' + format, path + 'negz' + format
            ];

            // hdr
            if (format === '.hdr') {

                return new Promise((resolve) => {

                    new THREE.HDRCubeTextureLoader().load(THREE.UnsignedByteType, cubeMapURLs, (hdrCubeMap) => {

                        var pmremGenerator = new THREE.PMREMGenerator(hdrCubeMap);
                        pmremGenerator.update(this.renderer);

                        var pmremCubeUVPacker = new THREE.PMREMCubeUVPacker(pmremGenerator.cubeLods);
                        pmremCubeUVPacker.update(this.renderer);

                        resolve({
                            envMap: pmremCubeUVPacker.CubeUVRenderTarget.texture,
                            cubeMap: hdrCubeMap
                        });

                    });

                });

            }

            // standard
            const envMap = new THREE.CubeTextureLoader().load(cubeMapURLs);
            envMap.format = THREE.RGBFormat;
            return Promise.resolve({envMap, cubeMap: envMap});

        }

        updateDisplay() {
            if (this.skeletonHelpers.length) {
                this.skeletonHelpers.forEach((helper) => this.scene.remove(helper));
            }

            this.traverseMaterials(this.content, (material) => {
                material.wireframe = this.state.wireframe;
            });

            this.content.traverse((node) => {
                if (node.isMesh && node.skeleton && this.state.skeleton) {
                    const helper = new THREE.SkeletonHelper(node.skeleton.bones[0].parent);
                    helper.material.linewidth = 3;
                    this.scene.add(helper);
                    this.skeletonHelpers.push(helper);
                }
            });

            if (this.state.grid !== Boolean(this.gridHelper)) {
                if (this.state.grid) {
                    this.gridHelper = new THREE.GridHelper();
                    this.axesHelper = new THREE.AxesHelper();
                    this.axesHelper.renderOrder = 999;
                    this.axesHelper.onBeforeRender = (renderer) => renderer.clearDepth();
                    this.scene.add(this.gridHelper);
                    this.scene.add(this.axesHelper);
                } else {
                    this.scene.remove(this.gridHelper);
                    this.scene.remove(this.axesHelper);
                    this.gridHelper = null;
                    this.axesHelper = null;
                }
            }
        }

        updateBackground() {
            this.background.style({colors: [this.state.bgColor1, this.state.bgColor2]});
        }

        clear() {

            if (!this.content) return;

            this.scene.remove(this.content);

            // dispose geometry
            this.content.traverse((node) => {

                if (!node.isMesh) return;

                node.geometry.dispose();

            });

            // dispose textures
            this.traverseMaterials(this.content, (material) => {

                MAP_NAMES.forEach((map) => {

                    if (material[map]) material[map].dispose();

                });

            });

        }

        traverseMaterials(object, callback) {
            object.traverse((node) => {
                if (!node.isMesh) return;
                const materials = Array.isArray(node.material)
                    ? node.material
                    : [node.material];
                materials.forEach(callback);
            });
        }

    }

    this.options = {
        model: '',
        preset: '',
        cameraPosition: null
    };
    let m1 = document.getElementById("m1");
    let viewer1 = new Viewer(m1, options);
    viewer1
        .load('model/m1/Elonva Export001.gltf')
        .then(() => {
            viewer1.resize()
        });

    let m2 = document.getElementById("m2");
    let viewer2 = new Viewer(m2, options);
    viewer2
        .load('model/m2/Orgal Export002.gltf')
        .then(() => {
            viewer2.resize()
        });

});