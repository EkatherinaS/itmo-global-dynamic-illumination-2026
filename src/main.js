import "./style.css";

import * as THREE from "three/webgpu";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { Pane } from "tweakpane";

function setMaterialRecursive(object3d, material) {
	object3d.children.forEach((child) => {
		if (child.material) {
			//https://threejs.org/docs/#Material.dispose
			child.material.dispose();
			child.material = material;
			child.castShadow = true;
		}
		if (child.children) setMaterialRecursive(child, material);
	});
}

function main() {
	const canvas = document.querySelector("#canvas");

	const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.VSMShadowMap;
	document.body.appendChild(renderer.domElement);

	const stats = Stats();
	document.body.appendChild(stats.dom);

	const fov = 60;
	const aspect = window.innerWidth / window.innerHeight;
	const near = 0.1;
	const far = 3;
	const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
	camera.position.set(0, 1.1, 0);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0xcccccc);

	const controls = new MapControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.25;
	controls.target.set(0, 0, 0);
	controls.maxPolarAngle = Math.PI / 3;

	const color = 0xffffff;
	const intensity = 2;
	const light = new THREE.DirectionalLight(color, intensity);
	light.position.set(-1, 2, 1);
	light.castShadow = true;
	light.shadow.radius = 1;
	light.shadow.blurSamples = 4;
	light.shadow.camera.near = 1;
	light.shadow.camera.far = 5;
	light.shadow.mapSize.width = 1024;
	light.shadow.mapSize.height = 1024;
	light.shadow.bias = -0.002;
	scene.add(light);

	const ambientLight = new THREE.AmbientLight(color, 0.5);
	scene.add(ambientLight);

	const materialSurface = new THREE.MeshPhongMaterial({
		color: 0x456789,
	});
	const geometry = new THREE.PlaneGeometry(20, 20);
	const mesh = new THREE.Mesh(geometry, materialSurface);
	mesh.position.set(0, 0, 0);
	mesh.rotateX(-Math.PI / 2);
	mesh.receiveShadow = true;
	scene.add(mesh);

	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	loader.load(
		"/public/models/map.glb",
		function (gltf) {
			const material = new THREE.MeshPhongMaterial({
				color: 0xabcdef,
			});
			gltf.scene.scale.set(0.001, 0.001, 0.001);
			setMaterialRecursive(gltf.scene, material);
			scene.add(gltf.scene);
		},
		function () {},
		function (error) {
			console.log(error);
		}
	);

	function animate() {
		controls.update();
		stats.update();
		render();
	}

	function render() {
		renderer.render(scene, camera);
	}

	const PARAMS = {
		shadows: true,
	};
	const pane = new Pane();
	pane.addBinding(PARAMS, "shadows").on("change", (ev) => {
		renderer.shadowMap.enabled = ev.value;
	});
}

main();
