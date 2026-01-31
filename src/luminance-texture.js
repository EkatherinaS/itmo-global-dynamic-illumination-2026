import * as THREE from "three/webgpu";
import { getSkyLuminance } from "./luminance-equation";
import {
	vec3,
	instanceIndex,
	instancedArray,
	Fn,
	color,
	float,
	storage,
	textureStore,
	texture,
} from "three/tsl";

let positionBuffer, uvBuffer, luminanceBuffer;
let size, luminanceStorageTexture;

export let luminanceTexture = {};

export function initGeometry(radius, detail) {
	const geometry = new THREE.IcosahedronGeometry(radius, detail);
	const positions = geometry.attributes.position;
	const uvs = geometry.attributes.uv;

	const count = positions.count;
	positionBuffer = storage(positions, "vec3", count);
	uvBuffer = storage(uvs, "vec2", count);
	luminanceBuffer = instancedArray(count, "float");

	size = 32;
	luminanceStorageTexture = new THREE.StorageTexture(size, size);

	return count;
}

export const computeLuminance = Fn(({ nevg, sunDir }) => {
	const luminance = luminanceBuffer.element(instanceIndex);
	const position = positionBuffer.element(instanceIndex);
	const sunDirection = vec3(sunDir.x, sunDir.y, sunDir.z);

	const baseLuminance = getSkyLuminance(position, sunDirection, nevg);
	luminance.assign(float(baseLuminance).mul(0.0001));
});

export const computeTexture = Fn(() => {
	const uv = uvBuffer.element(instanceIndex);
	const lva = luminanceBuffer.element(instanceIndex);

	const white = color(1.0, 1.0, 1.0, 1.0);
	const skyColor = white.mul(float(lva));
	const pixelCoord = uv.mul(size);

	textureStore(luminanceStorageTexture, pixelCoord, skyColor).toWriteOnly();
	luminanceTexture = texture(luminanceStorageTexture);
});
