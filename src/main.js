import "./style.css";

import {
	OrbitControls,
	VertexNormalsHelper,
} from "three/examples/jsm/Addons.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import * as THREE from "three/webgpu";
import { Pane } from "tweakpane";
import { getWebGPUMemoryUsage } from "webgpu-memory";
import {
	DEPTH_CAMERA_BOTTOM,
	DEPTH_CAMERA_LEFT,
	DEPTH_CAMERA_RIGHT,
	DEPTH_CAMERA_TOP,
	DEPTH_HEIGHT,
	DEPTH_WIDTH,
	depthTexture,
	depthTextureTest,
	GRID_HEIGHT,
	GRID_WIDTH,
	HEIGHT,
	LAYER_COUNT,
	NEVG,
	PROBE_COUNT,
	PROBE_GRID_TYPE,
	probePositions,
	SUN_DIR,
	updateGridSize,
	updateLayerCount,
	updateNevg,
	updateProbeGridType,
	updateSunDirectionX,
	updateSunDirectionY,
	updateSunDirectionZ,
	WIDTH,
} from "./constants";
import {
	blurProbeCoeffsUniform,
	computeGlobalLight,
	computeProbeVisibility,
	computeRegularGridProbePositions,
	computeStreetGridProbePositions,
	considerAngleUniform,
	debugDepthMap,
	debugProbes,
	directLightIntensityUniform,
	directLightUniform,
	enterShadowAreaUniform,
	gridHeightUniform,
	gridWidthUniform,
	horizontalBlurShader,
	irradianceLightIntensityUniform,
	irradianceLightUniform,
	layerCountUniform,
	probeCountUniform,
	probeLightIntensityUniform,
	probeLightUniform,
	shadowAreaBlurUniform,
	verticalBlurShader,
} from "./global-light.js";
import { Ground } from "./ground.js";
import {
	computeIrradianceCubemapFromLightBuffer,
	computeLightBuffer,
	getIrradianceColor,
	getIrradianceTexture,
} from "./irradiance-texture.js";
import {
	computeLuminanceCubemap,
	computeLuminanceTexture,
	getLuminanceColor,
	getLuminanceCubemap,
} from "./luminance-texture.js";
import {
	addCar,
	addMap,
	linkCameraToCar,
	loadCar,
	loadMapDxf,
	moveCar,
	showMapNormals,
	unLinkCameraFromCar,
	updateMaterialsCar,
	updateMaterialsMap,
} from "./models.js";
import {
	addProbe,
	clearProbes,
	hideLightProbeHelpers,
	showLightProbeHelpers,
	updateProbes,
} from "./probe.js";
import { Skydome } from "./skydome.js";

async function main() {
	// WEBGPU SETTINGS

	const adapter = await navigator.gpu.requestAdapter();
	if (adapter) console.log(adapter.limits);

	const canvas = document.querySelector("#canvas");

	const renderer = new THREE.WebGPURenderer({
		canvas,
		trackTimestamp: true,
	});
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(render);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.NoToneMapping;
	document.body.appendChild(renderer.domElement);

	renderer.inspector = new Inspector();
	document.body.appendChild(renderer.inspector.domElement);

	// SCENE SETTINGS

	const scene = new THREE.Scene();

	const axesHelper = new THREE.AxesHelper(3);
	scene.add(axesHelper);

	const camera = new THREE.PerspectiveCamera();
	camera.fov = 60;
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.near = 0.01;
	camera.far = 256;
	camera.position.set(0, 10, 0);

	let controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.25;
	controls.target.set(0, 0, 0);

	// COMPUTE SECTION

	const normalSunDir = SUN_DIR.clone().normalize();

	let updateComputeTexture = computeLuminanceTexture(
		NEVG,
		normalSunDir,
	).compute(WIDTH * HEIGHT);
	let updateComputeCubemap = computeLuminanceCubemap(
		NEVG,
		normalSunDir,
	).compute(12 * WIDTH * HEIGHT);
	let updateLightBuffer = computeLightBuffer().compute(12 * WIDTH * HEIGHT);
	let updateIrradianceCubemap =
		computeIrradianceCubemapFromLightBuffer().compute(12 * WIDTH * HEIGHT);

	let updateProbePositions = computeStreetGridProbePositions().compute(
		DEPTH_WIDTH * DEPTH_HEIGHT * LAYER_COUNT,
	);
	let updateDebugDepthMap = debugDepthMap().compute(DEPTH_WIDTH * DEPTH_HEIGHT);
	let updateDebugProbes = debugProbes().compute(PROBE_COUNT);
	let updateProbeVisibility = computeProbeVisibility().compute(
		DEPTH_WIDTH * DEPTH_HEIGHT,
	);
	let updateVerticalBlurShader = verticalBlurShader().compute(
		DEPTH_WIDTH * DEPTH_HEIGHT,
	);
	let updateHorizontalBlurShader = horizontalBlurShader().compute(
		DEPTH_WIDTH * DEPTH_HEIGHT,
	);

	// LIGHT SETTINGS

	const light = new THREE.DirectionalLight(0xffffff, 5);
	light.position.copy(normalSunDir.multiplyScalar(10));
	light.castShadow = true;

	light.shadow.radius = 1;
	light.shadow.blurSamples = 4;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.bias = -0.005;

	light.shadow.camera.rotation.set(0);
	light.shadow.camera.left = -15;
	light.shadow.camera.right = 15;
	light.shadow.camera.top = 15;
	light.shadow.camera.bottom = -15;
	light.shadow.camera.near = 1;
	light.shadow.camera.far = 30;
	scene.add(light);

	// const helperShadowCamera = new THREE.CameraHelper(light.shadow.camera);
	// helperShadowCamera.visible = true;
	// scene.add(helperShadowCamera);

	// DEPTH MAP RENDER

	const renderTarget = new THREE.RenderTarget(DEPTH_WIDTH, DEPTH_HEIGHT);
	renderTarget.depthTexture = depthTexture;
	const testCamera = new THREE.OrthographicCamera(
		DEPTH_CAMERA_LEFT,
		DEPTH_CAMERA_RIGHT,
		DEPTH_CAMERA_TOP,
		DEPTH_CAMERA_BOTTOM,
		1,
		2,
	);
	const cameraHelper = new THREE.CameraHelper(testCamera);
	//scene.add(cameraHelper);
	testCamera.position.set(0, 2, 0);
	testCamera.lookAt(0, 0, 0);
	scene.add(testCamera);

	await renderer.init();

	// SKYDOME

	const skydomeMesh = new Skydome(
		normalSunDir,
		NEVG,
		64,
		8,
		0x5c52f4,
		0x1b1b1b,
	);
	skydomeMesh.setCamera(camera);
	skydomeMesh.setScene(scene);

	const ground = new Ground(100, 64, 0x1b1b1b);
	ground.setScene(scene);

	const skyHelper = new VertexNormalsHelper(skydomeMesh.mesh, 1, 0xff0000);
	skyHelper.visible = false;
	scene.add(skyHelper);

	// MODELS

	loadMapDxf(() => {
		addMap(scene);
		computeDepthMap();
		updateComputeProbes();
		updateMaterialsMap();
		ground.setMaterialOutputNode(computeGlobalLight);

		loadCar(() => {
			addCar(scene);
			updateMaterialsCar();
		});
	});

	// COMPUTE SHADER

	function updateComputeSkydom() {
		renderer.compute(updateComputeTexture);
		renderer.compute(updateComputeCubemap);
		renderer.compute(updateLightBuffer);
		renderer.compute(updateIrradianceCubemap);
	}

	async function updateComputeProbes() {
		clearProbes(scene);

		await renderer.compute(updateProbePositions);
		await renderer.compute(updateProbeVisibility);

		await renderer.compute(updateHorizontalBlurShader);
		await renderer.compute(updateVerticalBlurShader);

		await renderer.compute(updateDebugDepthMap);
		await renderer.compute(updateDebugProbes);

		const bufferArray = await renderer.getArrayBufferAsync(probePositions);
		const outputData = new Float32Array(bufferArray);

		for (let i = 0; i < PROBE_COUNT - 1; i++) {
			if (outputData[i * 4 + 1] !== 0) {
				addProbe(
					outputData[i * 4 + 0],
					outputData[i * 4 + 1],
					outputData[i * 4 + 2],
				);
			}
		}

		await updateProbes(scene, renderer);

		const mem = getWebGPUMemoryUsage().memory;
		console.log(`Буферы: ${(mem.buffer / 1048576).toFixed(2)} MB`);
		console.log(`Текстуры: ${(mem.texture / 1048576).toFixed(2)} MB`);
		console.log(`Всего: ${(mem.total / 1048576).toFixed(2)} MB`);
	}

	function computeDepthMap() {
		// debug RenderTarget switches to show depth map
		renderer.setRenderTarget(renderTarget);
		renderer.render(scene, testCamera);
		renderer.setRenderTarget(null);
	}

	// DEBUG SECTION

	const icosahedromMaterialLuminance = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const icosahedronGeometryLuminance = new THREE.IcosahedronGeometry(1, 64);
	const icosahedronLuminance = new THREE.Mesh(
		icosahedronGeometryLuminance,
		icosahedromMaterialLuminance,
	);
	icosahedronLuminance.position.set(1.5, 3, 0);
	//scene.add(icosahedronLuminance);

	const icosahedromMaterialIrradiance = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const icosahedronGeometryIrradiance = new THREE.IcosahedronGeometry(1, 64);
	const icosahedronIrradiance = new THREE.Mesh(
		icosahedronGeometryIrradiance,
		icosahedromMaterialIrradiance,
	);
	icosahedronIrradiance.position.set(-1.5, 3, 0);
	//scene.add(icosahedronIrradiance);

	const materialLuminance = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const geometryLuminance = new THREE.PlaneGeometry(0.004, 0.003);
	const meshLuminance = new THREE.Mesh(geometryLuminance, materialLuminance);
	camera.add(meshLuminance);

	const materialIrradiance = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const geometryIrradiance = new THREE.PlaneGeometry(0.004, 0.003);
	const meshIrradiance = new THREE.Mesh(geometryIrradiance, materialIrradiance);
	camera.add(meshIrradiance);

	const material = new THREE.MeshBasicMaterial({
		map: depthTextureTest,
	});
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.004), material);
	camera.add(plane);

	// RENDER
	let frameStartTime = 0;

	function updateFrameStats() {
		const frame = renderer.inspector.currentFrame;
		if (frame.frameId % 30 === 0) {
			const totalTime30Frames = frame.startTime - frameStartTime;
			const avgFrameTime = totalTime30Frames / 30;
			const avgFPS = 1000 / avgFrameTime;
			frameStartTime = frame.startTime;
			console.log(
				`Frame Time: ${avgFrameTime.toFixed(2)} FPS: ${avgFPS.toFixed(2)}`,
			);
		}
	}

	function render() {
		const width = window.innerWidth;
		const height = window.innerHeight;
		const needResize =
			renderer.domElement.width != width ||
			renderer.domElement.height != height;

		if (needResize) {
			renderer.setSize(window.innerWidth, window.innerHeight);
			camera.aspect = window.innerWidth / window.innerHeight;
			meshLuminance.position.set(-camera.aspect * 0.005, -0.0005, -0.011);
			meshIrradiance.position.set(-camera.aspect * 0.005, -0.004, -0.011);
			plane.position.set(-camera.aspect * 0.005, 0.0035, -0.011);
			camera.updateProjectionMatrix();
		}

		moveCar();
		if (!camera.parent.isScene) controls.target.copy(camera.parent.position);

		controls.update();

		materialLuminance.colorNode = getLuminanceCubemap();
		materialIrradiance.colorNode = getIrradianceTexture();
		icosahedromMaterialLuminance.colorNode = getLuminanceColor();
		icosahedromMaterialIrradiance.colorNode = getIrradianceColor();

		renderer.render(scene, camera);
		renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER);
	}

	scene.add(camera);
	updateComputeSkydom();

	// SETTINGS

	const PARAMS = {
		blurProbeCoeffs: 4,
		enterShadowArea: 4,
		shadowAreaBlur: 0,
		shadows: true,
		shadowcamera: false,
		skydomenormals: false,
		isbackground: false,
		mapnormals: false,
		controls: "orbit",
		followCar: false,
		skydomehalfsphere: false,
		skydomskycolor: 0x29a1ff,
		skydomgroundcolor: 0x2c2c2d,
		skydomWireframe: false,
		skydomsunX: 0.1,
		skydomsunY: 0.2,
		skydomsunZ: 0.3,
		NEVG: 0.75,
		probeLight: false,
		directLight: true,
		probeHelpers: false,
		irradianceLight: false,
		probeGridSize: 15,
		probeLayerCount: 2,
		probeLightIntensity: 0.25,
		directLightIntensity: 1.0,
		irradianceLightIntensity: 0.1,
		considerAngle: false,
		probeGrid: "street",
	};
	const pane = new Pane({
		title: "Settings",
		expanded: true,
	});

	pane.addBinding(PARAMS, "shadows").on("change", (ev) => {
		renderer.shadowMap.enabled = ev.value;
	});

	pane
		.addBinding(PARAMS, "blurProbeCoeffs", {
			label: "blur radius",
			min: 0,
			max: 10,
			step: 1,
		})
		.on("change", (ev) => {
			blurProbeCoeffsUniform.value = ev.value;
		});

	pane
		.addBinding(PARAMS, "enterShadowArea", {
			label: "steps in shadow",
			min: 0,
			max: 10,
			step: 1,
		})
		.on("change", (ev) => {
			enterShadowAreaUniform.value = ev.value;
		});

	pane
		.addBinding(PARAMS, "shadowAreaBlur", {
			label: "blur in shadow",
			min: 0,
			max: 10,
			step: 1,
		})
		.on("change", (ev) => {
			shadowAreaBlurUniform.value = ev.value;
		});

	pane
		.addBinding(PARAMS, "followCar", {
			label: "follow car",
		})
		.on("change", (ev) => {
			if (ev.value) {
				controls.saveState();
				scene.remove(camera);
				linkCameraToCar(camera);
			} else {
				unLinkCameraFromCar(camera);
				controls.reset();
				camera.position.set(0, 10, 0);
				scene.add(camera);
			}
		});

	pane
		.addBinding(PARAMS, "skydomskycolor", {
			label: "sky color",
			view: "color",
		})
		.on("change", (ev) => {
			skydomeMesh.setSkyColor(ev.value);
			updateProbes(scene, renderer);
		});

	pane
		.addBinding(PARAMS, "skydomWireframe", {
			label: "sky wireframe",
		})
		.on("change", (ev) => {
			skydomeMesh.setWireframe(ev.value);
		});

	pane
		.addBinding(PARAMS, "skydomsunX", {
			label: "sun X",
			min: -1,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			updateSunDirectionX(ev.value);
			const normSunDir = SUN_DIR.clone().normalize();
			skydomeMesh.setSunDirection(normSunDir);

			updateComputeTexture.dispose();
			updateComputeTexture = computeLuminanceTexture(NEVG, normSunDir).compute(
				WIDTH * HEIGHT,
			);
			updateComputeCubemap.dispose();
			updateComputeCubemap = computeLuminanceCubemap(NEVG, normSunDir).compute(
				12 * WIDTH * HEIGHT,
			);
			updateComputeSkydom();

			light.position.copy(normSunDir.multiplyScalar(10));
			updateProbes(scene, renderer);
		});

	pane
		.addBinding(PARAMS, "skydomsunY", {
			label: "sun Y",
			min: 0,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			updateSunDirectionY(ev.value);
			const normSunDir = SUN_DIR.clone().normalize();
			skydomeMesh.setSunDirection(normSunDir);

			updateComputeTexture.dispose();
			updateComputeTexture = computeLuminanceTexture(NEVG, normSunDir).compute(
				WIDTH * HEIGHT,
			);
			updateComputeCubemap.dispose();
			updateComputeCubemap = computeLuminanceCubemap(NEVG, normSunDir).compute(
				12 * WIDTH * HEIGHT,
			);
			updateComputeSkydom();

			light.position.copy(normSunDir.multiplyScalar(10));
			updateProbes(scene, renderer);
		});

	pane
		.addBinding(PARAMS, "skydomsunZ", {
			label: "sun Z",
			min: -1,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			updateSunDirectionZ(ev.value);
			const normSunDir = SUN_DIR.clone().normalize();
			skydomeMesh.setSunDirection(normSunDir);

			updateComputeTexture.dispose();
			updateComputeTexture = computeLuminanceTexture(NEVG, normSunDir).compute(
				WIDTH * HEIGHT,
			);
			updateComputeCubemap.dispose();
			updateComputeCubemap = computeLuminanceCubemap(NEVG, normSunDir).compute(
				12 * WIDTH * HEIGHT,
			);
			updateComputeSkydom();

			light.position.copy(normSunDir.multiplyScalar(10));
			updateProbes(scene, renderer);
		});

	pane
		.addBinding(PARAMS, "NEVG", {
			label: "Nevg",
			min: 0.2,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			updateNevg(ev.value);
			skydomeMesh.setNevg(NEVG);

			updateComputeTexture.dispose();
			updateComputeTexture = computeLuminanceTexture(NEVG, SUN_DIR).compute(
				WIDTH * HEIGHT,
			);

			updateComputeCubemap.dispose();
			updateComputeCubemap = computeLuminanceCubemap(NEVG, SUN_DIR).compute(
				12 * WIDTH * HEIGHT,
			);

			updateComputeSkydom();
			updateProbes(scene, renderer);
		});

	// включение/выключение освещения от проб
	pane
		.addBinding(PARAMS, "probeLight", {
			label: "probe light",
		})
		.on("change", (ev) => {
			probeLightUniform.value = ev.value;
		});

	// включение/выключение направленного света
	pane
		.addBinding(PARAMS, "directLight", {
			label: "direct light",
		})
		.on("change", (ev) => {
			directLightUniform.value = ev.value;
		});

	// включение/выключение хелперов проб
	pane
		.addBinding(PARAMS, "probeHelpers", {
			label: "probe helpers",
		})
		.on("change", (ev) => {
			if (ev.value) {
				showLightProbeHelpers();
			} else {
				hideLightProbeHelpers();
			}
		});

	// включение/выключение irradiance cubemap (плюсом к текущему)
	pane
		.addBinding(PARAMS, "irradianceLight", {
			label: "irradiance light",
		})
		.on("change", (ev) => {
			irradianceLightUniform.value = ev.value;
		});

	// изменение количества проб
	pane
		.addBinding(PARAMS, "probeGridSize", {
			label: "probe grid size",
			min: 1,
			max: 40,
			step: 1,
		})
		.on("change", async (ev) => {
			if (!ev.last) return;

			updateDebugProbes.dispose();

			updateGridSize(ev.value);
			gridWidthUniform.value = ev.value;
			gridHeightUniform.value = ev.value;
			probeCountUniform.value = ev.value * ev.value * LAYER_COUNT;

			updateDebugProbes = debugProbes().compute(
				ev.value * ev.value * LAYER_COUNT,
			);

			await updateComputeProbes();
		});

	pane
		.addBinding(PARAMS, "probeLayerCount", {
			label: "probe layer count",
			min: 1,
			max: 4,
			step: 1,
		})
		.on("change", async (ev) => {
			if (!ev.last) return;

			updateDebugProbes.dispose();
			updateProbePositions.dispose();

			updateLayerCount(ev.value);
			layerCountUniform.value = ev.value;
			probeCountUniform.value = GRID_WIDTH * GRID_HEIGHT * ev.value;

			updateDebugProbes = debugProbes().compute(
				GRID_WIDTH * GRID_HEIGHT * ev.value,
			);

			if (PROBE_GRID_TYPE === "street") {
				updateProbePositions = computeStreetGridProbePositions().compute(
					DEPTH_WIDTH * DEPTH_HEIGHT * ev.value,
				);
			} else {
				updateProbePositions = computeRegularGridProbePositions().compute(
					GRID_WIDTH * GRID_HEIGHT * ev.value,
				);
			}

			await updateComputeProbes();
		});

	// изменение яркости небосвода
	pane
		.addBinding(PARAMS, "probeLightIntensity", {
			label: "probe intensity",
			min: 0,
			max: 2,
			step: 0.01,
		})
		.on("change", (ev) => {
			probeLightIntensityUniform.value = ev.value;
		});
	pane
		.addBinding(PARAMS, "directLightIntensity", {
			label: "direct intensity",
			min: 0,
			max: 2,
			step: 0.01,
		})
		.on("change", (ev) => {
			directLightIntensityUniform.value = ev.value;
		});
	pane
		.addBinding(PARAMS, "irradianceLightIntensity", {
			label: "irradiance intensity",
			min: 0,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			irradianceLightIntensityUniform.value = ev.value;
		});

	pane
		.addBinding(PARAMS, "considerAngle", {
			label: "consider angle",
		})
		.on("change", (ev) => {
			considerAngleUniform.value = ev.value;
		});

	pane
		.addBinding(PARAMS, "probeGrid", {
			options: {
				street: "street",
				regular: "regular",
			},
		})
		.on("change", async (ev) => {
			if (!ev.last) return;

			updateProbeGridType(ev.value);
			updateProbePositions.dispose();
			if (ev.value === "street") {
				updateProbePositions = computeStreetGridProbePositions().compute(
					DEPTH_WIDTH * DEPTH_HEIGHT * LAYER_COUNT,
				);
			} else {
				updateProbePositions = computeRegularGridProbePositions().compute(
					GRID_WIDTH * GRID_HEIGHT * LAYER_COUNT,
				);
			}

			await updateComputeProbes();
		});

	/*

	pane
		.addBinding(PARAMS, "mapnormals", {
			label: "map normals",
		})
		.on("change", (ev) => {
			showMapNormals(ev.value);
		});

	pane
		.addBinding(PARAMS, "controls", {
			options: {
				orbit: "orbit",
				map: "map",
			},
		})
		.on("change", (ev) => {
			controls.dispose();
			if (ev.value === "orbit") {
				controls = new OrbitControls(camera, controls.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.25;
				controls.target.set(0, 0, 0);
			}
			if (ev.value === "map") {
				camera.position.set(0, 10, 0);
				controls = new MapControls(camera, controls.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.25;
				controls.target.set(0, 0, 0);
				controls.maxPolarAngle = Math.PI / 3;
			}
		});

	pane
		.addBinding(PARAMS, "isbackground", {
			label: "background",
		})
		.on("change", (ev) => {
			skydomeMesh.setBackground(ev.value);
		});
	pane
		.addBinding(PARAMS, "skydomgroundcolor", {
			label: "ground color",
			view: "color",
		})
		.on("change", (ev) => {
			skydomeMesh.setGroundColor(ev.value);
			ground.setGroundColor(ev.value);
		});
    pane
        .addBinding(PARAMS, "shadowcamera", {
            label: "shadow camera",
        })
        .on("change", (ev) => {
            helperShadowCamera.visible = ev.value;
        });
    pane
        .addBinding(PARAMS, "skydomenormals", {
            label: "skydome normals",
        })
        .on("change", (ev) => {
            skyHelper.visible = ev.value;
        });
    pane
        .addBinding(PARAMS, "skydomehalfsphere", {
            label: "skydome halfsphere",
        })
        .on("change", (ev) => {
            skydomeMesh.setHalfSphere(ev.value);
        });
    */
}

main();
