import * as THREE from "three/webgpu";

export const WIDTH = 32;
export const HEIGHT = 32;
export const DEPTH_WIDTH = 256;
export const DEPTH_HEIGHT = 256;
export const DEPTH_CAMERA_LEFT = -10;
export const DEPTH_CAMERA_RIGHT = 10;
export const DEPTH_CAMERA_TOP = -10;
export const DEPTH_CAMERA_BOTTOM = 10;
export const GRID_WIDTH = 8;
export const GRID_HEIGHT = 8;
export const SH_COEFFICIENTS_COUNT = 9;
// CHANGE to switch between probe grids
// if using regular grid -> 2 * GRID_WIDTH * GRID_HEIGHT (it generates 2 layers)
// if using street grid -> GRID_WIDTH * GRID_HEIGHT
export const PROBE_COUNT = 2 * GRID_WIDTH * GRID_HEIGHT;

export const luminanceStorageTexture = new THREE.StorageTexture(WIDTH, HEIGHT);
export const luminanceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);
export const irradianceStorageCubemap = new THREE.StorageTexture(
	4 * WIDTH,
	3 * HEIGHT,
);

export const depthTextureTest = new THREE.StorageTexture(
	DEPTH_WIDTH,
	DEPTH_HEIGHT,
);
export const depthTexture = new THREE.DepthTexture(
	DEPTH_WIDTH,
	DEPTH_HEIGHT,
	THREE.FloatType,
);

export const probePositions = new THREE.StorageBufferAttribute(PROBE_COUNT, 4);
export const sphericalHarmonics = new THREE.StorageBufferAttribute(
	SH_COEFFICIENTS_COUNT * PROBE_COUNT,
	4,
);
