import {
	Fn,
	If,
	Loop,
	atomicAdd,
	atomicLoad,
	color,
	distance,
	dot,
	float,
	instanceIndex,
	instancedArray,
	int,
	max,
	texture,
	textureLoad,
	textureStore,
	uint,
	uvec2,
	vec3,
} from "three/tsl";
import {
	HEIGHT,
	WIDTH,
	irradianceStorageCubemap,
	luminanceStorageCubemap,
} from "./constants";
import {
	getCoordinatesOnFace,
	getFace,
	getUVForLocalNormal,
	getUVOnFace,
} from "./cubemap-helper";

// MANY THREADS WITH ATOMIC ADD AND PRECALC FOR ANGLES

const irradianceBuffer = instancedArray(12 * HEIGHT * WIDTH, "int").toAtomic();
const correction = 1e6;

// launch compute with (12 * HEIGHT * WIDTH)^2 threads
export const computeIrradianceCubemapToBuffer = Fn(() => {
	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);
	const size = w.mul(h).mul(12);

	// normalDir & lightDir are radius vectors

	// big squares - normal & irradiance
	const normalIndex = uint(instanceIndex.div(size));
	const normalIndX = normalIndex.mod(w);
	const normalIndY = normalIndex.div(w.mul(4)).mod(h);
	const normalFace = int(getFace(normalIndex, w, h));

	const normalDir = getCoordinatesOnFace(normalFace, normalIndX, normalIndY, r);
	const normalLen = distance(normalDir, vec3(0));

	// small squares - light & luminance
	const lightIndex = uint(instanceIndex.mod(size));
	const lightIndX = lightIndex.mod(w);
	const lightIndY = lightIndex.div(w.mul(4)).mod(h);
	const lightFace = int(getFace(lightIndex.mod(size), w, h));

	const lightDir = getCoordinatesOnFace(lightFace, lightIndX, lightIndY, r);
	const lightLen = distance(lightDir, vec3(0));

	If(lightFace.greaterThanEqual(0).and(normalFace.greaterThanEqual(0)), () => {
		const luminanceUV = getUVOnFace(lightFace, lightIndX, lightIndY, w, h);
		const luminance = textureLoad(luminanceStorageCubemap, luminanceUV);

		// dot product : A*B = cos(phi)*|A|*|B|
		// we need to add cos(phi) * value
		// so...  cos(phi) = A*B / |A|*|B|
		const dotProduct = dot(normalDir, lightDir);
		const cosPhi = dotProduct.div(normalLen).div(lightLen);
		const irradiance = max(float(0), cosPhi.mul(luminance));

		atomicAdd(
			irradianceBuffer.element(normalIndex),
			irradiance.mul(correction),
		);
	});
});

// launch compute with 12 * HEIGHT * WIDTH threads
export const computeIrradianceCubemapFromBuffer = Fn(() => {
	const w = float(WIDTH);
	const h = float(HEIGHT);
	const size = WIDTH * HEIGHT * 6;

	const u = instanceIndex.mod(w.mul(4));
	const v = instanceIndex.div(w.mul(4)).mod(h.mul(3));
	const indexUV = uvec2(u, v);

	const irradiance = atomicLoad(irradianceBuffer.element(instanceIndex));
	const white = color(1.0, 1.0, 1.0, 1.0);
	textureStore(
		irradianceStorageCubemap,
		indexUV,
		white.mul(irradiance).div(correction).div(size),
	);
});

// LIGHT BUFFER + DOT MULTIPLY LIGHT DIRS WITH NORMALS

const lightBuffer = instancedArray(6 * HEIGHT * WIDTH, "vec3");

// launch compute with 12 * HEIGHT * WIDTH threads
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

// launch compute with 12 * HEIGHT * WIDTH threads
export const computeIrradianceCubemapFromLightBuffer = Fn(() => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);
	const face = float(getFace(instanceIndex, WIDTH, HEIGHT));

	If(uint(face).greaterThanEqual(0), () => {
		// computing irradianceCubemap[indX, indY]

		const normalDir = getCoordinatesOnFace(face, indX, indY, r);
		const normalLen = distance(normalDir, vec3(0));

		const result = float(0);

		Loop(HEIGHT, WIDTH, 6, ({ i, j, k }) => {
			const ind = uint(k).mul(w).mul(h).add(float(i).mul(w)).add(float(j));
			const lightValue = lightBuffer.element(ind);
			const irradiance = max(
				float(0),
				dot(normalDir, lightValue).div(normalLen),
			);
			result.addAssign(irradiance);
		});

		//const ind = uint(face).mul(WIDTH * HEIGHT).add(indY.mul(WIDTH)).add(indX);
		const indexUV = getUVOnFace(face, indX, indY, w, h);
		textureStore(irradianceStorageCubemap, indexUV, result.div(WIDTH * HEIGHT));
	});
});

// BIG LOOP FOR EACH ELEMENT

// launch compute with 12 * HEIGHT * WIDTH threads
export const computeIrradianceCubemapWithLoop = Fn(() => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);
	const face = float(getFace(instanceIndex, WIDTH, HEIGHT));

	If(uint(face).greaterThanEqual(0), () => {
		// computing irradianceCubemap[indX, indY]

		const normalDir = getCoordinatesOnFace(face, indX, indY, r);
		const normalLen = distance(normalDir, vec3(0));

		const zero = vec3(0);
		const result = float(0);

		Loop(HEIGHT, WIDTH, 6, ({ i, j, k }) => {
			const indX = uint(j);
			const indY = uint(i);
			const face = uint(k);

			// normalDir & lightDir are radius vectors
			const lightDir = getCoordinatesOnFace(face, indX, indY, r);

			// dot product : A*B = cos(phi)*|A|*|B|
			// we need to add cos(phi) * value
			// so...  cos(phi) = A*B / |A|*|B|
			const dotProduct = dot(normalDir, lightDir);
			const lightLen = distance(lightDir, zero);
			const cosPhi = dotProduct.div(normalLen).div(lightLen);
			const valueUV = getUVOnFace(face, indX, indY, w, h);
			const value = textureLoad(luminanceStorageCubemap, valueUV);
			const irradiance = max(float(0), cosPhi.mul(value));
			result.addAssign(irradiance);
		});

		const white = color(1.0, 1.0, 1.0, 1.0);
		const indexUV = getUVOnFace(face, indX, indY, w, h);
		const irradiance = white.mul(result).div(WIDTH * HEIGHT * 6);

		textureStore(irradianceStorageCubemap, indexUV, irradiance);
	});
});

export const getIrradianceColor = Fn(() => {
	const indexUV = getUVForLocalNormal(WIDTH, HEIGHT);
	return textureLoad(irradianceStorageCubemap, indexUV);
});

export function getIrradianceTexture() {
	return texture(irradianceStorageCubemap);
}
