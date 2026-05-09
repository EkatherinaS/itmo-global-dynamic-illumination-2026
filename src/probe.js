import * as THREE from "three/webgpu";
import { LightProbeGenerator } from "../node_modules/three/examples/jsm/lights/LightProbeGenerator.js";
import { LightProbeHelper } from "three/examples/jsm/helpers/LightProbeHelperGPU.js";
import {
	PROBE_COUNT,
	probePositions,
	SH_COEFFICIENTS_COUNT,
	sphericalHarmonics,
} from "./constants.js";

let cameras = [];
let helpers = [];

export const clearProbes = (scene) => {
	helpers.forEach((helper) => {
		scene.remove(helper);
	});

	cameras = [];
	helpers = [];
};

export const addProbe = (x, y, z) => {
	cameras.push([x, y, z]);
};

export const updateProbes = async (scene, renderer) => {
	let count = 0;

	const blockSize = SH_COEFFICIENTS_COUNT * 4;
	const data = new Float32Array(blockSize * PROBE_COUNT);

	cameras.forEach(async (pos) => {
		const target = new THREE.CubeRenderTarget(64, {
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
		});

		const camera = new THREE.CubeCamera(0.01, 5, target);
		camera.position.set(pos[0], pos[1], pos[2]);
		camera.update(renderer, scene);
		target.needsUpdate = true;

		const lightprobe = await LightProbeGenerator.fromCubeRenderTarget(
			renderer,
			target,
		);

		target.textures[0].dispose();
		target.dispose();

		lightprobe.position.copy(camera.position);
		lightprobe.sh.coefficients.forEach((v, i) => {
			data[count * blockSize + i * 3] = v.x;
			data[count * blockSize + i * 3 + 1] = v.y;
			data[count * blockSize + i * 3 + 2] = v.z;
		});

		count++;

		if (count == cameras.length) {
			sphericalHarmonics.copyArray(data);
			sphericalHarmonics.needsUpdate = true;
		}

		const helper = new LightProbeHelper(lightprobe, 0.2);
		helpers.push(helper);
		scene.add(helper);
	});
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
