import * as THREE from "three/webgpu";
import { LightProbeGenerator } from "../node_modules/three/examples/jsm/lights/LightProbeGenerator.js";
import { LightProbeHelper } from "three/examples/jsm/helpers/LightProbeHelperGPU.js";
import {
	PROBE_COUNT,
	probePositions,
	SH_COEFFICIENTS_COUNT,
	sphericalHarmonics,
} from "./constants.js";

class Probe {
	constructor(c, rt) {
		this.camera = c;
		this.renderTarget = rt;
	}
}

const probes = [];

export const addProbe = (scene, x, y, z) => {
	const cubeRenderTarget = new THREE.CubeRenderTarget(16, {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat,
		type: THREE.FloatType,
	});
	const cubeCamera = new THREE.CubeCamera(0.01, 1, cubeRenderTarget);
	cubeCamera.position.set(x, y, z);
	scene.add(cubeCamera);

	const probe = new Probe(cubeCamera, cubeRenderTarget);
	probes.push(probe);
};

export const updateProbes = (scene, renderer) => {
	probes.forEach((probe) => {
		probe.camera.update(renderer, scene);
	});
};

export const getLightProbes = (scene, renderer) => {
	let count = 0;

	const blockSize = SH_COEFFICIENTS_COUNT * 4;
	const data = new Float32Array(blockSize * PROBE_COUNT);
	//const positions = new Float32Array(PROBE_COUNT * 3);

	probes.forEach((probe) => {
		const promise = LightProbeGenerator.fromCubeRenderTarget(
			renderer,
			probe.renderTarget,
		);

		promise.then((lightprobe) => {
			lightprobe.position.copy(probe.camera.position);
			lightprobe.intensity = 2;
			console.log(lightprobe);

			lightprobe.sh.coefficients.forEach((v, i) => {
				data[count * blockSize + i * 3] = v.x;
				data[count * blockSize + i * 3 + 1] = v.y;
				data[count * blockSize + i * 3 + 2] = v.z;
			});
			count++;

			if (count == probes.length) {
				sphericalHarmonics.copyArray(data);
				sphericalHarmonics.needsUpdate = true;
				//probePositions.copyArray(positions);
				//probePositions.needsUpdate = true;

				console.log(sphericalHarmonics);
			}

			scene.add(new LightProbeHelper(lightprobe, 0.2));
		});
	});
};
