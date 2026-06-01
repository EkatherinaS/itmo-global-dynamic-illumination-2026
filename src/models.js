import { GLTFLoader, VertexNormalsHelper } from "three/examples/jsm/Addons.js";
import * as THREE from "three/webgpu";
import { DXFLoader } from "./dxf-countour-loader.js";
import { computeGlobalLight } from "./global-light";

const loader = new GLTFLoader();
let carModel, mapModel;
let helpers = [];

const CAR_GOL_QUADRO = "public/models/gol_quadrado.glb";
const CAR_PORSCHE_911 = "public/models/porsche_911.glb";
const MAP_1KM = "public/models/map_colored.glb";
const MAP_CONTOURS = "public/models/contours.dxf";

export function loadCar(callback) {
	loader.load(
		CAR_PORSCHE_911,
		(gltf) => {
			carModel = gltf.scene;
			const material = new THREE.MeshPhongNodeMaterial({
				color: 0xffffff,
				flatShading: false,
			});
			carModel.traverse((o) => {
				if (o.isMesh) o.material = material;
			});
			carModel.position.set(2, 0, 1.5);
			carModel.scale.set(0.22, 0.22, 0.22);
			carModel.rotateY(-1);
			callback();
		},
		undefined,
		(error) => {
			console.error(error);
		},
	);
}

export function loadMapGlb(callback) {
	loader.load(
		MAP_1KM,
		(gltf) => {
			mapModel = gltf.scene;
			mapModel.position.set(0.8, 0, 0.8);
			mapModel.scale.set(0.02, 0.02, 0.02);
			callback();
		},
		undefined,
		(error) => {
			console.error(error);
		},
	);
}

export function loadMapDxf(callback) {
	const dxfloader = new DXFLoader();
	dxfloader.load(MAP_CONTOURS, function (model) {
		mapModel = model.model;
		mapModel.scale.set(0.01, 0.01, 0.01);
		mapModel.rotateX(-Math.PI / 2);
		mapModel.children.forEach((mesh) =>
			helpers.push(new VertexNormalsHelper(mesh, 10, 0xff0000, 10)),
		);
		new THREE.Box3()
			.setFromObject(mapModel)
			.getCenter(mapModel.position)
			.multiply(new THREE.Vector3(-1, 0, -1));
		callback();
	});
}

let angle = Math.atan2(2 - 11.5834, 2 - 8.5278);
const cx = 8.5278;
const cz = 11.5834;
const radius = 11.596;

export function moveCar() {
	if (carModel) {
		angle -= 0.005;
		carModel.position.x = cx + radius * Math.cos(angle);
		carModel.position.z = cz + radius * Math.sin(angle);
		carModel.rotation.y = -angle + Math.PI;
		if (carModel.position.z > 12) angle -= 2.1;
		return carModel.position;
	} else {
		//console.warn("move: car is not defined");
	}
}

export function linkCameraToCar(camera) {
	carModel.add(camera);
}

export function unLinkCameraFromCar(camera) {
	carModel.remove(camera);
}

export function addCar(scene) {
	if (carModel) {
		scene.add(carModel);
	} else {
		console.warn("add: car is not defined");
	}
}

export function addMap(scene) {
	if (mapModel) {
		scene.add(mapModel);
	} else {
		console.warn("map is not defined");
	}
}

export function showMapNormals(value) {
	helpers.forEach((helper) => (helper.visible = value));
}

export function updateMaterialsMap() {
	if (mapModel) {
		mapModel.traverse((o) => {
			if (o.isMesh) {
				o.castShadow = true;
				o.receiveShadow = true;
				o.material.outputNode = computeGlobalLight();
			}
		});
	}
}

export function updateMaterialsCar() {
	if (carModel) {
		carModel.traverse((o) => {
			if (o.isMesh) o.material.outputNode = computeGlobalLight();
		});
	}
}
