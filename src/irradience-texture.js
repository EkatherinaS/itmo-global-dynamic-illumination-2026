import {
	vec3,
	instanceIndex,
	Fn,
	float,
	textureStore,
	distance,
	abs,
	max,
	vec4,
	dot,
	textureLoad,
	color,
	texture,
	sqrt,
	instancedArray,
	If,
	uint,
} from "three/tsl";
import {
	HEIGHT,
	WIDTH,
	irradienceStorageCubemap,
	luminanceStorageCubemap,
} from "./constants";
import { getCoordinatesOnFace, getFace, getUVOnFace } from "./cubemap-helper";

const lightBuffer = instancedArray(6 * HEIGHT * WIDTH, "vec3");

export const computeLightBuffer = Fn(() => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);
	const face = getFace(instanceIndex, WIDTH, HEIGHT);

	If(float(face).greaterThanEqual(float(0)), () => {
		const ind = uint(face)
			.mul(WIDTH * HEIGHT)
			.add(indY.mul(WIDTH))
			.add(indX);

		// dot product : A*B = cos(phi)*|A|*|B|
		// we need to add cos(phi) * value
		// so...  cos(phi) = A*B / |A|*|B|
		const lightDir = getCoordinatesOnFace(face, indX, indY, r);
		const lightLen = distance(lightDir, vec3(0));

		const valueUV = getUVOnFace(face, indX, indY, w, h);
		const value = textureLoad(luminanceStorageCubemap, valueUV);

		const lightTemp = lightDir.mul(value).div(lightLen);
		lightBuffer.element(ind).assign(lightTemp);
	});
});

export const computeIrradienceCubemap = Fn(() => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);
	const face = float(getFace(instanceIndex, WIDTH, HEIGHT));

	If(uint(face).greaterThanEqual(0), () => {
		// computing irradienceCubemap[indX, indY]

		const normalDir = getCoordinatesOnFace(face, indX, indY, r);
		const normalLen = distance(normalDir, vec3(0));

		const result = float(0);
		for (let f = 0; f < 6; f++) {
			const indF = uint(f).mul(w).mul(h);
			for (let i = 0; i < HEIGHT; i++) {
				const indY = indF.add(float(i).mul(w));
				for (let j = 0; j < WIDTH; j++) {
					const ind = indY.add(float(j));
					const lightValue = lightBuffer.element(ind);
					const irradience = max(
						float(0),
						dot(normalDir, lightValue).div(normalLen),
					);
					result.addAssign(irradience);
				}
			}
		}

		//const ind = uint(face).mul(WIDTH * HEIGHT).add(indY.mul(WIDTH)).add(indX);
		const indexUV = getUVOnFace(face, indX, indY, w, h);
		textureStore(
			irradienceStorageCubemap,
			indexUV,
			result.div(100),
		).toReadWrite();
	});
});

/*
const getIrradienceForNormal = Fn(({ normalDir }) => {
	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);

	const zero = vec3(0);
	const normalLen = distance(normalDir, zero);
	let result = float(0);

	for (let i = 0; i < 12 * HEIGHT * WIDTH; i++) {
		const index = float(i);
		// normalDir & lightDir are radius vectors
		const indX = index.mod(WIDTH);
		const indY = index.div(WIDTH * 4).mod(HEIGHT);
		const face = float(getFace(index, WIDTH, HEIGHT));
		const lightDir = getCoordinatesOnFace(face, indX, indY, r);
		// dot product : A*B = cos(phi)*|A|*|B|
		// we need to add cos(phi) * value
		// so...  cos(phi) = A*B / |A|*|B|
		const dotProduct = dot(normalDir, lightDir);
		const lightLen = distance(lightDir, zero);
		const cosPhi = dotProduct.div(normalLen.mul(lightLen));
		const valueUV = getUVOnFace(face, indX, indY, w, h);
		const value = textureLoad(luminanceStorageCubemap, valueUV);

		result.addAssign(cosPhi.mul(value));
	}

	const white = color(1.0, 1.0, 1.0, 1.0);
	return white.mul(float(result.div(100)));
});
*/

export function getIrradienceTexture() {
	return texture(irradienceStorageCubemap);
}
