import { LightProbeHelper } from "three/examples/jsm/helpers/LightProbeHelperGPU.js";
import * as THREE from "three/webgpu";
import { LightProbeGenerator } from "../node_modules/three/examples/jsm/lights/LightProbeGenerator.js";
import {
	PROBE_COUNT,
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
	const target = new THREE.CubeRenderTarget(64, {
		format: THREE.RGBAFormat,
		type: THREE.FloatType,
	});
	const camera = new THREE.CubeCamera(0.001, 1, target);
	camera.position.set(x, y, z);
	cameras.push(camera);
};

export const updateProbes = async (scene, renderer) => {
	const blockSize = SH_COEFFICIENTS_COUNT * 4;
	const data = new Float32Array(blockSize * PROBE_COUNT);
	clearHelpers(scene);

	for (let i = 0; i < cameras.length; i++) {
		const camera = cameras[i];
		camera.update(renderer, scene);

		const lightprobe = await LightProbeGenerator.fromCubeRenderTarget(
			renderer,
			camera.renderTarget,
		);
		LightProbeGenerator.data = null;

		lightprobe.position.copy(camera.position);
		lightprobe.sh.coefficients.forEach((v, j) => {
			data[i * blockSize + j * 3] = v.x;
			data[i * blockSize + j * 3 + 1] = v.y;
			data[i * blockSize + j * 3 + 2] = v.z;
		});

		sphericalHarmonics.copyArray(data);
		sphericalHarmonics.needsUpdate = true;

		const helper = new LightProbeHelper(lightprobe, 0.2);
		helper.visible = false;
		helpers.push(helper);
		scene.add(helper);

		lightprobe.dispose();
	}
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
