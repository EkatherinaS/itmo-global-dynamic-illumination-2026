import * as THREE from "three/webgpu";

export const WIDTH = 32;
export const HEIGHT = 32;
export const DEPTH_WIDTH = 512;
export const DEPTH_HEIGHT = 512;
export const DEPTH_CAMERA_LEFT = -12;
export const DEPTH_CAMERA_RIGHT = 12;
export const DEPTH_CAMERA_TOP = -12;
export const DEPTH_CAMERA_BOTTOM = 12;
export const SH_COEFFICIENTS_COUNT = 9;
export const MAX_PROBE_COUNT = 6400;

export let PROBE_GRID_TYPE = "street";
export let GRID_WIDTH = 15;
export let GRID_HEIGHT = 15;
export let LAYER_COUNT = 1;
export let PROBE_COUNT = GRID_WIDTH * GRID_HEIGHT * LAYER_COUNT;
export let SUN_DIR = new THREE.Vector3(0.1, 0.2, 0.3);
export let NEVG = 0.75;
export let BLUR_PROBE_COEF = 4;
export let ENTER_SHADOW_AREA = 2;
export let SHADOW_AREA_BLUR = 0;
export let PROBE_INTENSITY = 0.05;
export let DIRECT_INTENSITY = 1.0;
export let IRRAIDANCE_INTENSITY = 0.0;
export let INTERPOLATE = false;
export let CONSIDER_ANGLE = false;

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

export function updateSunDirectionX(value) {
	SUN_DIR.x = value;
}

export function updateSunDirectionY(value) {
	SUN_DIR.y = value;
}

export function updateSunDirectionZ(value) {
	SUN_DIR.z = value;
}

export function updateNevg(value) {
	NEVG = value;
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

export const depthTexture = new THREE.DepthTexture(DEPTH_WIDTH, DEPTH_HEIGHT);
export const depthTextureTest = new THREE.StorageTexture(
	DEPTH_WIDTH,
	DEPTH_HEIGHT,
);

// cannot be disposed yet - using max count https://github.com/mrdoob/three.js/issues/32969
export const probePositions = new THREE.StorageBufferAttribute(
	MAX_PROBE_COUNT,
	4,
);
export const sphericalHarmonics = new THREE.StorageBufferAttribute(
	SH_COEFFICIENTS_COUNT * MAX_PROBE_COUNT,
	4,
);

export const probeVisibility = new THREE.StorageBufferAttribute(
	DEPTH_WIDTH * DEPTH_HEIGHT,
	4,
);
export const probeVisibilityCoeffs = new THREE.StorageTexture(
	DEPTH_WIDTH,
	DEPTH_HEIGHT,
);
export const blurTexture = new THREE.StorageTexture(DEPTH_WIDTH, DEPTH_HEIGHT);
