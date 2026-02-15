import * as THREE from "three/webgpu";

export const WIDTH = 16;
export const HEIGHT = 16;

export const luminanceStorageTexture = new THREE.StorageTexture(WIDTH, HEIGHT);
luminanceStorageTexture.type = THREE.FloatType;

export const luminanceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);
luminanceStorageCubemap.type = THREE.FloatType;

export const irradianceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);
irradianceStorageCubemap.type = THREE.FloatType;
