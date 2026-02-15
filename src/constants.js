import * as THREE from "three/webgpu";

export const WIDTH = 4;
export const HEIGHT = 4;

export const luminanceStorageTexture = new THREE.StorageTexture(WIDTH, HEIGHT, {
	format: THREE.RGBA16F,
});
export const luminanceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
	{
		format: THREE.RGBA16F,
	},
);
export const irradianceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
	{
		format: THREE.RGBA16F,
	},
);
