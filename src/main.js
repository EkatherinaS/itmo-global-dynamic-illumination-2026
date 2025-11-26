import "./style.css";
import { DXFLoader } from "./dxf-countour-loader.js";

import * as THREE from "three/webgpu";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { Pane } from "tweakpane";
import { VertexNormalsHelper } from "three/examples/jsm/Addons.js";

async function main() {
	const canvas = document.querySelector("#canvas");

	const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.VSMShadowMap;
	document.body.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0xcccccc);

	const stats = Stats();
	document.body.appendChild(stats.dom);

	const camera = new THREE.PerspectiveCamera();
	camera.fov = 60;
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.near = 0.01;
	camera.far = 50;
	camera.position.set(0, 10, 0);

	const controls = new MapControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.25;
	controls.target.set(0, 0, 0);
	controls.maxPolarAngle = Math.PI / 3;

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

	const materialSurface = new THREE.MeshPhongMaterial({
		color: 0x456789,
	});
	const geometry = new THREE.PlaneGeometry(100, 100);
	const mesh = new THREE.Mesh(geometry, materialSurface);
	mesh.position.set(0, 0, 0);
	mesh.rotateX(-Math.PI / 2);
	mesh.receiveShadow = true;
	scene.add(mesh);

	let helper;

	const dxfloader = new DXFLoader();
	dxfloader.load("public/models/contours.dxf", function (model) {
		const group = model.model;
		group.position.set(0, 0, 0);
		group.scale.set(0.01, 0.01, 0.01);
		group.rotateX(-Math.PI / 2);
		new THREE.Box3()
			.setFromObject(group)
			.getCenter(group.position)
			.multiply(new THREE.Vector3(-1, 0, -1));
		scene.add(group);
		helper = new VertexNormalsHelper(group.children[0], 0.1, 0xff0000);
		scene.add(helper);
	});

	function animate() {
		controls.update();
		stats.update();
		//helper.update();
		render();
	}

	function render() {
		renderer.render(scene, camera);
	}

	const PARAMS = {
		shadows: true,
		shadowcamera: false,
	};
	const pane = new Pane({
		title: "Settings",
		expanded: true,
	});

	pane.addBinding(PARAMS, "shadows").on("change", (ev) => {
		renderer.shadowMap.enabled = ev.value;
	});

	pane
		.addBinding(PARAMS, "shadowcamera", {
			label: "shadow camera",
		})
		.on("change", (ev) => {
			helperShadowCamera.visible = ev.value;
		});
}

main();
