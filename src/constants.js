import * as THREE from "three/webgpu";

export const WIDTH = 64;
export const HEIGHT = 64;

export const luminanceStorageTexture = new THREE.StorageTexture(WIDTH, HEIGHT);
luminanceStorageTexture.type = THREE.HalfFloatType;

export const luminanceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);
luminanceStorageCubemap.type = THREE.HalfFloatType;

export const irradianceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);
irradianceStorageCubemap.type = THREE.HalfFloatType;

