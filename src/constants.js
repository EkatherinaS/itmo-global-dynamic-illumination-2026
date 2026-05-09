import { color } from "three/tsl";
import * as THREE from "three/webgpu";

export const WIDTH = 32;
export const HEIGHT = 32;
export const DEPTH_WIDTH = 256;
export const DEPTH_HEIGHT = 256;
export const DEPTH_CAMERA_LEFT = -10;
export const DEPTH_CAMERA_RIGHT = 10;
export const DEPTH_CAMERA_TOP = -10;
export const DEPTH_CAMERA_BOTTOM = 10;
export const SH_COEFFICIENTS_COUNT = 9;
export const MAX_GRID_SIZE = 15;

export let GRID_WIDTH = 8;
export let GRID_HEIGHT = 8;
// CHANGE to switch between probe grids
// if using regular grid -> 2 * GRID_WIDTH * GRID_HEIGHT (it generates 2 layers)
// if using street grid -> GRID_WIDTH * GRID_HEIGHT
export let PROBE_COUNT = GRID_WIDTH * GRID_HEIGHT;

export function updateGridSize(size) {
	GRID_WIDTH = size;
	GRID_HEIGHT = size;
	PROBE_COUNT = size * size;
}

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

const array = new Float32Array(DEPTH_WIDTH * DEPTH_HEIGHT * 4);
array.fill(-1.0);
export const visibleProbes = new THREE.StorageBufferAttribute(array, 4);

export const probePositions = new THREE.StorageBufferAttribute(
	MAX_GRID_SIZE * MAX_GRID_SIZE,
	4,
);
export const sphericalHarmonics = new THREE.StorageBufferAttribute(
	SH_COEFFICIENTS_COUNT * MAX_GRID_SIZE * MAX_GRID_SIZE,
	4,
);
