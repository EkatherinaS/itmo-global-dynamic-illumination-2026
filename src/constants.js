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
export const MAX_GRID_SIZE = 20;
export const MAX_LAYER_SIZE = 5;

export let PROBE_GRID_TYPE = "street";
export let GRID_WIDTH = 3;
export let GRID_HEIGHT = 3;
export let LAYER_COUNT = 4;
export let PROBE_COUNT = GRID_WIDTH * GRID_HEIGHT * LAYER_COUNT;

export function updateGridSize(value) {
	GRID_WIDTH = value;
	GRID_HEIGHT = value;
	PROBE_COUNT = value * value * LAYER_COUNT;
}

export function updateLayerCount(value) {
	LAYER_COUNT = value;
	PROBE_COUNT = GRID_WIDTH * GRID_HEIGHT * value;
}

export function updateProbeGridType(value) {
	PROBE_GRID_TYPE = value;
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
export const visibilityStrength = new THREE.StorageBufferAttribute(array, 4);

export const probePositions = new THREE.StorageBufferAttribute(
	MAX_GRID_SIZE * MAX_GRID_SIZE * MAX_LAYER_SIZE,
	4,
);
export const sphericalHarmonics = new THREE.StorageBufferAttribute(
	SH_COEFFICIENTS_COUNT * MAX_GRID_SIZE * MAX_GRID_SIZE * MAX_LAYER_SIZE,
	4,
);
