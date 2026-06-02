import * as THREE from "three/webgpu";
import { LightProbeGenerator } from "../node_modules/three/examples/jsm/lights/LightProbeGenerator.js";
import {
	PROBE_COUNT,
	SH_COEFFICIENTS_COUNT,
	sphericalHarmonics,
} from "./constants.js";

let cameras = [];

export const clearProbes = (scene) => {
	cameras.forEach((camera) => {
		for (let i = 0; i < camera.renderTarget.textures.length; i++) {
			camera.renderTarget.textures[i].dispose();
		}
		camera.renderTarget.dispose();
		camera.clear();
	});
	cameras = [];
};

export const addProbe = (x, y, z) => {
	const target = new THREE.CubeRenderTarget(16, {
		format: THREE.RGBAFormat,
		type: THREE.FloatType,
	});
	const camera = new THREE.CubeCamera(0.001, 2, target);
	target.dispose();
	camera.position.set(x, y, z);
	cameras.push(camera);
};

export const updateProbes = async (scene, renderer) => {
	const blockSize = SH_COEFFICIENTS_COUNT * 4;
	const data = new Float32Array(blockSize * PROBE_COUNT);

	for (let i = 0; i < cameras.length; i++) {
		cameras[i].update(renderer, scene);

		const lightprobe = await LightProbeGenerator.fromCubeRenderTarget(
			renderer,
			cameras[i].renderTarget,
		);
		LightProbeGenerator.data = null;

		lightprobe.sh.coefficients.forEach((v, j) => {
			data[i * blockSize + j * 3] = v.x;
			data[i * blockSize + j * 3 + 1] = v.y;
			data[i * blockSize + j * 3 + 2] = v.z;
		});
		lightprobe.dispose();

		console.log("Camera", i, "/", PROBE_COUNT, "is created");
	}

	sphericalHarmonics.copyArray(data);
	sphericalHarmonics.needsUpdate = true;
};

// let helpers = [];

// export const clearHelpers = (scene) => {
// 	helpers.forEach((helper) => {
// 		helper.dispose();
// 		scene.remove(helper);
// 	});
// 	helpers = [];
// };

// export const showLightProbeHelpers = () => {
// 	helpers.forEach((helper) => {
// 		helper.visible = true;
// 	});
// };

// export const hideLightProbeHelpers = () => {
// 	helpers.forEach((helper) => {
// 		helper.visible = false;
// 	});
// };
