import { LightProbeHelper } from "three/examples/jsm/helpers/LightProbeHelperGPU.js";
import * as THREE from "three/webgpu";
import { LightProbeGenerator } from "../node_modules/three/examples/jsm/lights/LightProbeGenerator.js";
import {
	PROBE_COUNT,
	PROBE_RENDER_TARGET_SIZE,
	probeCameraTarget,
	SH_COEFFICIENTS_COUNT,
	sphericalHarmonics,
} from "./constants.js";

let cameras = [];
let helpers = [];

export const clearHelpers = (scene) => {
	helpers.forEach((helper) => {
		helper.dispose();
		scene.remove(helper);
	});
	helpers = [];
};

export const clearProbes = (scene) => {
	cameras.forEach((camera) => {
		for (let i = 0; i < camera.renderTarget.textures.length; i++) {
			camera.renderTarget.textures[i].dispose();
		}
		camera.renderTarget.dispose();
		camera.clear();
		scene.remove(camera);
	});
	cameras = [];
};

export const addProbe = (x, y, z) => {
	const target = new THREE.CubeRenderTarget(PROBE_RENDER_TARGET_SIZE, {
		format: THREE.RGBAFormat,
		type: THREE.FloatType,
	});
	const camera = new THREE.CubeCamera(0.001, 2, target);
	camera.position.set(x, y, z);
	cameras.push(camera);
};

export const updateProbes = async (scene, renderer) => {
	const start = performance.now();
	const blockSize = SH_COEFFICIENTS_COUNT * 4;
	for (let i = 0; i < cameras.length; i++) {
		const camera = cameras[i];
		camera.update(renderer, scene);
		const imageWidth = camera.renderTarget.width;
		for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
			const data = await renderer.readRenderTargetPixelsAsync(
				camera.renderTarget,
				0,
				0,
				imageWidth,
				imageWidth,
				0,
				faceIndex,
			);
			const faceSize = PROBE_RENDER_TARGET_SIZE * PROBE_RENDER_TARGET_SIZE * 4;
			const index = i * 6 * faceSize + faceIndex * faceSize;
			probeCameraTarget.array.set(data, index);
		}
	}
	probeCameraTarget.needsUpdate = true;

	const end = performance.now();
	console.log(`Время выполнения updateProbes: ${(end - start).toFixed(2)} мс`);
};

export const showLightProbeHelpers = () => {
	helpers.forEach((helper) => {
		helper.visible = true;
	});
};

export const hideLightProbeHelpers = () => {
	helpers.forEach((helper) => {
		helper.visible = false;
	});
};
