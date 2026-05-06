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
	computeRegularGridProbePositions,
	computeStreetGridProbePositions,
	debugDepthMap,
	debugProbes,
	directLightUniform,
	irradianceLightUniform,
	probeLightUniform,
} from "./global-light.js";

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
	renderer.setAnimationLoop(animate);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.BasicShadowMap;
	renderer.toneMapping = THREE.NoToneMapping;
	document.body.appendChild(renderer.domElement);

	renderer.inspector = new Inspector();
	document.body.appendChild(renderer.inspector.domElement);

	const scene = new THREE.Scene();

	const axesHelper = new THREE.AxesHelper(3);
	//scene.add(axesHelper);

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

	let sunDirection = new THREE.Vector3(0.1, 0.2, 0.3);
	let skydomNevg = 0.75;

	const light = new THREE.DirectionalLight(0xffffff, 5);
	light.position.copy(sunDirection);
	light.castShadow = true;

	light.shadow.radius = 1;
	light.shadow.blurSamples = 4;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.bias = -0.002;

	light.shadow.camera.left = -15;
	light.shadow.camera.right = 15;
	light.shadow.camera.top = 15;
	light.shadow.camera.bottom = -15;
	light.shadow.camera.near = 1;
	light.shadow.camera.far = 10;

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
	let updateProbePositions = computeStreetGridProbePositions(
		GRID_WIDTH,
		GRID_HEIGHT,
		PROBE_COUNT,
	).compute(DEPTH_WIDTH * DEPTH_HEIGHT);
	let updateDebugDepthMap = debugDepthMap(
		GRID_WIDTH,
		GRID_HEIGHT,
		PROBE_COUNT,
	).compute(DEPTH_WIDTH * DEPTH_HEIGHT);
	let updateDebugProbes = debugProbes(PROBE_COUNT).compute(PROBE_COUNT);

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

	//const helperShadowCamera = new THREE.CameraHelper(light.shadow.camera);
	//helperShadowCamera.visible = false;
	//scene.add(helperShadowCamera);

	const loader = new GLTFLoader();
	loader.load(
		//"public/models/gol_quadrado.glb",
		"public/models/porsche_911.glb",
		(gltf) => {
			const model = gltf.scene;
			//const material = new THREE.MeshBasicMaterial();
			//material.colorNode = getIrradianceColor();
			const material = new THREE.MeshPhongMaterial({
				color: 0xffffff,
				flatShading: false,
			});
			model.traverse((o) => {
				if (o.isMesh) o.material = material;
			});
			model.position.set(2, 0, 1.5);
			model.scale.set(0.2, 0.2, 0.2);
			model.rotateY(-1);
			scene.add(model);
		},
		undefined,
		(error) => {
			console.error(error);
		},
	);

	const dxfloader = new DXFLoader();
	const helpers = [];
	dxfloader.load("public/models/contours.dxf", async function (model) {
		const group = model.model;
		group.position.set(0, 0, 0);
		group.scale.set(0.01, 0.01, 0.01);
		group.rotateX(-Math.PI / 2);
		group.children.forEach((mesh) =>
			helpers.push(new VertexNormalsHelper(mesh, 10, 0xff0000, 10)),
		);
		helpers.forEach((helper) => {
			group.add(helper);
			helper.visible = false;
		});
		new THREE.Box3()
			.setFromObject(group)
			.getCenter(group.position)
			.multiply(new THREE.Vector3(-1, 0, -1));
		scene.add(group);

		computeDepthMap();
		updateComputeProbes();
	});

	const skydomeMesh = new Skydome(
		sunDirection,
		skydomNevg,
		64,
		64,
		0x29a1ff,
		0x2c2c2d,
	);
	skydomeMesh.setCamera(camera);
	skydomeMesh.setScene(scene);

	const ground = new Ground(50, 64, 0x2c2c2d);
	ground.setScene(scene);

	const skyHelper = new VertexNormalsHelper(skydomeMesh.mesh, 1, 0xff0000);
	skyHelper.visible = false;
	scene.add(skyHelper);

	async function animate() {
		controls.update();
		render();
	}

	// compute shader
	function updateComputeSkydom() {
		renderer.compute(updateComputeTexture);
		renderer.compute(updateComputeCubemap);
		renderer.compute(updateLightBuffer);
		renderer.compute(updateIrradianceCubemap);
		updateProbes(scene, renderer);
	}

	async function updateComputeProbes() {
		clearProbes(scene);

		renderer.compute(updateProbePositions);
		renderer.compute(updateDebugDepthMap);
		renderer.compute(updateDebugProbes);

		const bufferArray = await renderer.getArrayBufferAsync(probePositions);
		const outputData = new Float32Array(bufferArray);
		console.log(outputData);

		for (let i = 0; i < PROBE_COUNT; i++) {
			addProbe(
				scene,
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
					console.log(`GPU Render Time: ${avg / 100} ns`);
				}
			});

		renderer.render(scene, camera);
	}
	// END OF DEBUG SECTION

	scene.add(camera);
	updateComputeSkydom();

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
		probeGridSize: 8,
		skydomIntensity: 0.5,
		directIntensity: 0.5,
	};
	const pane = new Pane({
		title: "Settings",
		expanded: true,
	});

	pane.addBinding(PARAMS, "shadows").on("change", (ev) => {
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
			light.position.copy(sunDirection);
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
			light.position.copy(sunDirection);
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
			light.position.copy(sunDirection);
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

	// изменение количества проб
	pane
		.addBinding(PARAMS, "probeGridSize", {
			label: "probe grid size",
			min: 0,
			max: 15,
			step: 1,
		})
		.on("change", (ev) => {
			updateGridSize(ev.value);
			// gridWidthUniform.value = ev.value;
			// gridHeightUniform.value = ev.value;
			// probeCountUniform.value = ev.value * ev.value;

			updateProbePositions = computeStreetGridProbePositions(
				ev.value,
				ev.value,
				ev.value * ev.value,
			).compute(DEPTH_WIDTH * DEPTH_HEIGHT);
			updateDebugDepthMap = debugDepthMap(
				ev.value,
				ev.value,
				ev.value * ev.value,
			).compute(DEPTH_WIDTH * DEPTH_HEIGHT);
			updateDebugProbes = debugProbes(ev.value * ev.value).compute(
				ev.value * ev.value,
			);

			updateComputeProbes();
		});

	// изменение яркости небосвода
	pane
		.addBinding(PARAMS, "skydomIntensity", {
			label: "skydom intensity",
			min: 0,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {});

	// изменение яркости направленного света
	pane
		.addBinding(PARAMS, "directIntensity", {
			label: "direct intensity",
			min: 0,
			max: 1,
			step: 0.01,
		})
		.on("change", (ev) => {});

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
