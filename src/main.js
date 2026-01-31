import "./style.css";

import * as THREE from "three/webgpu";
import { Inspector } from "three/examples/jsm/inspector/Inspector.js";
import { DXFLoader } from "./dxf-countour-loader.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { Pane } from "tweakpane";
import {
	OrbitControls,
	VertexNormalsHelper,
} from "three/examples/jsm/Addons.js";
import { Ground } from "./ground.js";
import {
	initGeometry,
	computeLuminance,
	computeTexture,
	luminanceTexture,
} from "./luminance-texture.js";
import { Skydome } from "./skydome.js";

async function main() {
	const canvas = document.querySelector("#canvas");

	const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.VSMShadowMap;
	document.body.appendChild(renderer.domElement);

	renderer.inspector = new Inspector();
	document.body.appendChild(renderer.inspector.domElement);

	const scene = new THREE.Scene();

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

	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);

	const light = new THREE.DirectionalLight(0xffffff, 2);
	light.position.set(-1, 6, 1);
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

	const helperShadowCamera = new THREE.CameraHelper(light.shadow.camera);
	scene.add(helperShadowCamera);
	helperShadowCamera.visible = false;

	const dxfloader = new DXFLoader();
	const helpers = [];
	dxfloader.load("public/models/contours.dxf", function (model) {
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
	});

	let sunDirection = new THREE.Vector3(0.1, 0.2, 0.3);
	let skydomNevg = 0.75;

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
	scene.add(camera);

	const ground = new Ground(50, 64, 0x2c2c2d);
	ground.setScene(scene);

	const skyHelper = new VertexNormalsHelper(skydomeMesh.mesh, 1, 0xff0000);
	skyHelper.visible = false;
	scene.add(skyHelper);

	await renderer.init();

	async function animate() {
		controls.update();
		render();
	}

	// compute shader init
	const count = initGeometry(64, 64);
	let updateComputeLuminance = computeLuminance(
		skydomNevg,
		sunDirection,
	).compute(count);
	const updateComputeTexture = computeTexture().compute(count);

	// debug icosahedron for compute shader
	const materialDebug = new THREE.MeshBasicNodeMaterial({
		color: 0x00ff00,
	});
	const geometryDebug = new THREE.IcosahedronGeometry(1, 16);
	const meshDebug = new THREE.Mesh(geometryDebug, materialDebug);
	meshDebug.position.set(0, 3, 0);
	scene.add(meshDebug);

	function render() {
		const canvas = renderer.domElement;
		const width = window.innerWidth;
		const height = window.innerHeight;
		const needResize = canvas.width != width || canvas.height != height;

		if (needResize) {
			renderer.setSize(window.innerWidth, window.innerHeight);
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
		}

		renderer.compute(updateComputeLuminance);
		renderer.compute(updateComputeTexture);
		materialDebug.colorNode = luminanceTexture;

		renderer.render(scene, camera);
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
		.addBinding(PARAMS, "mapnormals", {
			label: "map normals",
		})
		.on("change", (ev) => {
			helpers.forEach((helper) => (helper.visible = ev.value));
		});
	/*pane
		.addBinding(PARAMS, "skydomehalfsphere", {
			label: "skydome halfsphere",
		})
		.on("change", (ev) => {
			skydomeMesh.setHalfSphere(ev.value);
		});*/
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
			updateComputeLuminance = computeSkydomLuminance(
				skydomNevg,
				sunDirection,
			).compute(count);
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
			updateComputeLuminance = computeSkydomLuminance(
				skydomNevg,
				sunDirection,
			).compute(count);
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
			updateComputeLuminance = computeSkydomLuminance(
				skydomNevg,
				sunDirection,
			).compute(count);
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
			updateComputeLuminance = computeSkydomLuminance(
				skydomNevg,
				sunDirection,
			).compute(count);
		});
}

main();
