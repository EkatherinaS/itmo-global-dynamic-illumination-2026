import * as THREE from "three/webgpu";

export const WIDTH = 32;
export const HEIGHT = 32;
export const PROBE_COUNT = 4;
export const SH_COEFFICIENTS_COUNT = 9;

export const luminanceStorageTexture = new THREE.StorageTexture(WIDTH, HEIGHT);
export const luminanceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);
export const irradianceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);

export const depthTexture = new THREE.DepthTexture(4 * WIDTH, 3 * HEIGHT);
depthTexture.type = THREE.FloatType;
export const depthTextureTest = new THREE.StorageTexture(4 * WIDTH, 3 * HEIGHT);

export const sphericalHarmonics = new THREE.StorageBufferAttribute(
	SH_COEFFICIENTS_COUNT * PROBE_COUNT * 3,
	1,
);
export const probePositions = new THREE.StorageBufferAttribute(4, 3);
