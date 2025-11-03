import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MapControls } from "three/addons/controls/MapControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

function setMaterialRecursive(object3d, material) {
	object3d.children.forEach((child) => {
		if (child.material) {
			child.material.dispose();
			child.material = material;
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
	document.body.appendChild(renderer.domElement);

	const fov = 60;
	const aspect = window.innerWidth / window.innerHeight;
	const near = 0.01;
	const far = 10;
	const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
	camera.position.set(0, 2, 0);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0xcccccc);
	scene.fog = new THREE.FogExp2(0xcccccc, 0.1);

	const controls = new MapControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.25;
	controls.target.set(0, 0, 0);
	controls.maxPolarAngle = Math.PI / 3;

	const color = 0xffffff;
	const intensity = 1;
	const light = new THREE.DirectionalLight(color, intensity);
	light.position.set(-1, 2, 4);
	scene.add(light);

	const ambientLight = new THREE.AmbientLight(color, 0.5);
	scene.add(ambientLight);

	const material = new THREE.MeshPhongMaterial({
		color: 0xabcdef,
	});

	const materialSurface = new THREE.MeshPhongMaterial({
		color: 0x456789,
	});
	const geometry = new THREE.PlaneGeometry(100, 100);
	const mesh = new THREE.Mesh(geometry, materialSurface);
	mesh.position.set(0, 0, 0);
	mesh.rotateX(-Math.PI / 2);
	scene.add(mesh);

	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	loader.load(
		"../public/models/map.glb",
		function (gltf) {
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
		render();
	}

	function render() {
		renderer.render(scene, camera);
	}
}

main();
