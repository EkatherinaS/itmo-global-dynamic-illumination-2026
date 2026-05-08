import "./style.css";

import * as THREE from "three/webgpu";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { DXFLoader } from "./dxf-countour-loader.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { Pane } from "tweakpane";
import {
	GLTFLoader,
	OrbitControls,
	VertexNormalsHelper,
} from "three/examples/jsm/Addons.js";
import { Ground } from "./ground.js";
import {
	computeLuminanceTexture,
	computeLuminanceCubemap,
	getLuminanceCubemap,
	getLuminanceColor,
} from "./luminance-texture.js";
import { Skydome } from "./skydome.js";
import {
	computeIrradianceCubemapFromLightBuffer,
	getIrradianceTexture,
	computeLightBuffer,
	getIrradianceColor,
} from "./irradiance-texture.js";
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
	PROBE_COUNT,
	probePositions,
	sphericalHarmonics,
	updateGridSize,
	WIDTH,
} from "./constants";
import {
	addProbe,
	clearProbes,
	hideLightProbeHelpers,
	showLightProbeHelpers,
	updateProbes,
} from "./probe.js";
import {
	computeGlobalLight,
	computeProbeVisibility,
	computeRegularGridProbePositions,
	computeStreetGridProbePositions,
	debugDepthMap,
	debugProbes,
	directLightIntensityUniform,
	directLightUniform,
	gridHeightUniform,
	gridWidthUniform,
	irradianceLightIntensityUniform,
	irradianceLightUniform,
	probeCountUniform,
	probeLightIntensityUniform,
	probeLightUniform,
} from "./global-light.js";
import { int, uint } from "three/tsl";

async function main() {
	const adapter = await navigator.gpu.requestAdapter();
	if (adapter) console.log(adapter.limits);

	const canvas = document.querySelector("#canvas");

	const renderer = new THREE.WebGPURenderer({
		canvas,
		antialias: true,
		trackTimestamp: true,
	});
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animateAsync);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.BasicShadowMap;
	renderer.toneMapping = THREE.NoToneMapping;
	document.body.appendChild(renderer.domElement);

	renderer.inspector = new Inspector();
	document.body.appendChild(renderer.inspector.domElement);

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

	//const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	//scene.add(ambientLight);

	let sunDirection = new THREE.Vector3(0.1, 0.2, 0.3).normalize();
	let skydomNevg = 0.75;

	const light = new THREE.DirectionalLight(0xffffff, 5);
	light.position.copy(sunDirection.multiplyScalar(10));
	light.castShadow = true;

	light.shadow.radius = 1;
	light.shadow.blurSamples = 4;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.bias = -0.002;

	light.shadow.camera.rotation.set(0);
	light.shadow.camera.left = -15;
	light.shadow.camera.right = 15;
	light.shadow.camera.top = 15;
	light.shadow.camera.bottom = -15;
	light.shadow.camera.near = 1;
	light.shadow.camera.far = 30;

	// const helperShadowCamera = new THREE.CameraHelper(light.shadow.camera);
	// helperShadowCamera.visible = true;
	// scene.add(helperShadowCamera);

	scene.add(light);

	let updateComputeTexture = computeLuminanceTexture(
		skydomNevg,
		sunDirection,
	).compute(WIDTH * HEIGHT);
	let updateComputeCubemap = computeLuminanceCubemap(
		skydomNevg,
		sunDirection,
	).compute(12 * WIDTH * HEIGHT);
	let updateLightBuffer = computeLightBuffer().compute(12 * WIDTH * HEIGHT);
	let updateIrradianceCubemap =
		computeIrradianceCubemapFromLightBuffer().compute(12 * WIDTH * HEIGHT);

	// CHANGE to switch between probe grids
	let updateProbePositions = computeStreetGridProbePositions().compute(
		DEPTH_WIDTH * DEPTH_HEIGHT,
	);
	let updateDebugDepthMap = debugDepthMap().compute(DEPTH_WIDTH * DEPTH_HEIGHT);
	let updateDebugProbes = debugProbes().compute(PROBE_COUNT);
	let updateProbeVisibility = computeProbeVisibility().compute(
		DEPTH_WIDTH * DEPTH_HEIGHT * 4,
	);

	// debug camera & plane for depth map
	const renderTarget = new THREE.RenderTarget(DEPTH_WIDTH, DEPTH_HEIGHT);
	renderTarget.depthTexture = depthTexture;
	const testCamera = new THREE.OrthographicCamera(
		DEPTH_CAMERA_LEFT,
		DEPTH_CAMERA_RIGHT,
		DEPTH_CAMERA_TOP,
		DEPTH_CAMERA_BOTTOM,
		1,
		10,
	);
	testCamera.position.set(0, 5, 0);
	testCamera.lookAt(0, 0, 0);
	scene.add(testCamera);

	await renderer.init();

	const loader = new GLTFLoader();
	let carModel, mapModel;

	loader.load(
		//"public/models/gol_quadrado.glb",
		"public/models/porsche_911.glb",
		(gltf) => {
			const model = gltf.scene;
			const material = new THREE.MeshPhongNodeMaterial({
				color: 0xffffff,
				flatShading: false,
			});
			model.traverse((o) => {
				if (o.isMesh) o.material = material;
			});
			model.position.set(2, 0, 1.5);
			model.scale.set(0.2, 0.2, 0.2);
			model.rotateY(-1);
			carModel = model;
		},
		undefined,
		(error) => {
			console.error(error);
		},
	);

	function updateMaterials() {
		carModel.traverse((o) => {
			if (o.isMesh) o.material.outputNode = computeGlobalLight();
		});
		scene.add(carModel);
		mapModel.traverse((o) => {
			if (o.isMesh) o.material.outputNode = computeGlobalLight();
		});
		ground.setMaterialOutputNode(computeGlobalLight());
	}

	const dxfloader = new DXFLoader();
	const helpers = [];
	dxfloader.load("public/models/contours.dxf", function (model) {
		const group = model.model;
		group.children.forEach((mesh) => {
			helpers.push(new VertexNormalsHelper(mesh, 10, 0xff0000, 10));
		});
		helpers.forEach((helper) => {
			group.add(helper);
			helper.visible = false;
		});
		mapModel = group;
		scene.add(mapModel);

		computeDepthMap();
		updateComputeProbes();
		updateMaterials();
	});

	const skydomeMesh = new Skydome(
		sunDirection,
		skydomNevg,
		64,
		64,
		0x29a1ff,
		0x1b1b1b,
	);
	skydomeMesh.setCamera(camera);
	skydomeMesh.setScene(scene);

	const ground = new Ground(200, 64, 0x1b1b1b);
	ground.setScene(scene);

	const skyHelper = new VertexNormalsHelper(skydomeMesh.mesh, 1, 0xff0000);
	skyHelper.visible = false;
	scene.add(skyHelper);

	let angle = Math.atan2(2 - 11.5834, 2 - 8.5278);
	const cx = 8.5278;
	const cz = 11.5834;
	const radius = 11.596;

	async function animateAsync() {
		if (carModel) {
			angle -= 0.005;
			carModel.position.x = cx + radius * Math.cos(angle);
			carModel.position.z = cz + radius * Math.sin(angle);
			carModel.rotation.y = -angle + Math.PI;
			if (carModel.position.z > 12) angle -= 2.1;
		}
		controls.update();
		render();
	}

	// compute shader
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
		await renderer.compute(updateDebugDepthMap);
		await renderer.compute(updateDebugProbes);

		const bufferArray = await renderer.getArrayBufferAsync(probePositions);
		const outputData = new Float32Array(bufferArray);

		for (let i = 0; i < PROBE_COUNT; i++) {
			addProbe(
				outputData[i * 4 + 0],
				outputData[i * 4 + 1],
				outputData[i * 4 + 2],
			);
		}

		updateProbes(scene, renderer);
	}

	function computeDepthMap() {
		// debug RenderTarget switches to show depth map
		renderer.setRenderTarget(renderTarget);
		renderer.render(scene, testCamera);
		renderer.setRenderTarget(null);
	}

	// DEBUG SECTION

	// debug icosahedron for Luminance
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

	// debug icosahedron for Irradiance
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

	// debug plane for Luminance
	const materialLuminance = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const geometryLuminance = new THREE.PlaneGeometry(0.004, 0.003);
	const meshLuminance = new THREE.Mesh(geometryLuminance, materialLuminance);
	camera.add(meshLuminance);

	// debug plane for Irradiance
	const materialIrradiance = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const geometryIrradiance = new THREE.PlaneGeometry(0.004, 0.003);
	const meshIrradiance = new THREE.Mesh(geometryIrradiance, materialIrradiance);
	camera.add(meshIrradiance);

	// debug camera & plane for depth map
	const material = new THREE.MeshBasicMaterial({
		map: depthTextureTest,
	});
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.004), material);
	camera.add(plane);

	let times = [];
	function render() {
		const canvas = renderer.domElement;
		const width = window.innerWidth;
		const height = window.innerHeight;
		const needResize = canvas.width != width || canvas.height != height;

		if (needResize) {
			renderer.setSize(window.innerWidth, window.innerHeight);
			camera.aspect = window.innerWidth / window.innerHeight;
			meshLuminance.position.set(-camera.aspect * 0.005, -0.0005, -0.011);
			meshIrradiance.position.set(-camera.aspect * 0.005, -0.004, -0.011);
			plane.position.set(-camera.aspect * 0.005, 0.0035, -0.011);
			camera.updateProjectionMatrix();
		}

		materialLuminance.colorNode = getLuminanceCubemap();
		materialIrradiance.colorNode = getIrradianceTexture();
		icosahedromMaterialLuminance.colorNode = getLuminanceColor();
		icosahedromMaterialIrradiance.colorNode = getIrradianceColor();

		renderer
			.resolveTimestampsAsync(THREE.TimestampQuery.RENDER)
			.then((result) => {
				if (times.length < 100) {
					times.push(result);
				} else {
					let avg = 0;
					times.forEach((t) => {
						avg += t;
					});
					times = [];
					//console.log(`GPU Render Time: ${avg / 100} ns`);
				}
			});

		renderer.render(scene, camera);
	}
	// END OF DEBUG SECTION

	scene.add(camera);
	updateComputeSkydom();

	const textures = [];
	function test(pos1, pos2) {
		const target = new THREE.CubeRenderTarget(64, {
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
		});
		const cubeCamera = new THREE.CubeCamera(0.01, 5, target);
		cubeCamera.position.set(8.75, 0.3, 2);
		cubeCamera.update(renderer, scene);
		const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
		const sphereMaterial = new THREE.MeshStandardNodeMaterial({
			color: 0xffffff,
			metalness: 1.0,
			roughness: 0.0,
			envMap: target.texture,
		});
		const mirrorSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		mirrorSphere.position.set(2, 2, 5);
		scene.add(mirrorSphere);

		const target1 = new THREE.CubeRenderTarget(64, {
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
		});
		const cubeCamera1 = new THREE.CubeCamera(0.01, 5, target1);
		cubeCamera1.position.set(8.75, 0.3, 9);
		cubeCamera1.update(renderer, scene);
		const sphereGeometry1 = new THREE.SphereGeometry(1, 32, 32);
		const sphereMaterial1 = new THREE.MeshStandardNodeMaterial({
			color: 0xffffff,
			metalness: 1.0,
			roughness: 0.1,
			envMap: target1.texture,
		});
		const mirrorSphere1 = new THREE.Mesh(sphereGeometry1, sphereMaterial1);
		mirrorSphere1.position.set(2, 2, 7);
		scene.add(mirrorSphere1);
	}

	// SETTINGS

	const PARAMS = {
		shadows: true,
		shadowcamera: false,
		skydomenormals: false,
		isbackground: false,
		mapnormals: false,
		controls: "orbit",
		skydomehalfsphere: false,
		skydomskycolor: 0x29a1ff,
		skydomgroundcolor: 0x2c2c2d,
		skydomWireframe: false,
		skydomsunX: 0.1,
		skydomsunY: 0.2,
		skydomsunZ: 0.3,
		skydomNevg: 0.3,
		probeLight: false,
		directLight: true,
		probeHelpers: true,
		irradianceLight: false,
		probeGridSize: 5,
		probeLightIntensity: 1.0,
		directLightIntensity: 1.0,
		irradianceLightIntensity: 0.5,
	};
	const pane = new Pane({
		title: "Settings",
		expanded: true,
	});

	pane.addBinding(PARAMS, "shadows").on("change", (ev) => {
		console.log("PAAAAAAAAAAANE");
		renderer.shadowMap.enabled = ev.value;
	});

	pane
		.addBinding(PARAMS, "isbackground", {
			label: "background",
		})
		.on("change", (ev) => {
			skydomeMesh.setBackground(ev.value);
		});

	pane
		.addBinding(PARAMS, "mapnormals", {
			label: "map normals",
		})
		.on("change", (ev) => {
			helpers.forEach((helper) => (helper.visible = ev.value));
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
		.addBinding(PARAMS, "skydomskycolor", {
			label: "sky color",
			view: "color",
		})
		.on("change", (ev) => {
			skydomeMesh.setSkyColor(ev.value);
			scene.background = new THREE.Color(ev.value);
			scene.fog = new THREE.FogExp2(ev.value, 0.002);
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
			sunDirection.x = ev.value;
			skydomeMesh.setSunDirection(sunDirection);
			light.position.copy(sunDirection.normalize().multiplyScalar(10));
			updateComputeSkydom();
		});

	pane
		.addBinding(PARAMS, "skydomsunY", {
			label: "sun Y",
			min: 0,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			sunDirection.y = ev.value;
			skydomeMesh.setSunDirection(sunDirection);
			light.position.copy(sunDirection.normalize().multiplyScalar(10));
			updateComputeSkydom();
		});

	pane
		.addBinding(PARAMS, "skydomsunZ", {
			label: "sun Z",
			min: -1,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			sunDirection.z = ev.value;
			skydomeMesh.setSunDirection(sunDirection);
			light.position.copy(sunDirection.normalize().multiplyScalar(10));
			updateComputeSkydom();
		});

	pane
		.addBinding(PARAMS, "skydomNevg", {
			label: "Nevg",
			min: 0.2,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {
			skydomNevg = ev.value;
			skydomeMesh.setNevg(skydomNevg);
			updateComputeSkydom();
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

	// TODO
	// изменение количества проб
	// pane
	// 	.addBinding(PARAMS, "probeGridSize", {
	// 		label: "probe grid size",
	// 		min: 0,
	// 		max: 15,
	// 		step: 1,
	// 	})
	// 	.on("change", async (ev) => {
	// 		if (!ev.last) return;
	// 		updateGridSize(ev.value);
	// 		updateDebugProbes = debugProbes().compute(ev.value * ev.value);
	// 		gridWidthUniform.value = ev.value;
	// 		gridHeightUniform.value = ev.value;
	// 		probeCountUniform.value = ev.value * ev.value;
	// 		await updateComputeProbes();
	// 	});

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

	/*
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
