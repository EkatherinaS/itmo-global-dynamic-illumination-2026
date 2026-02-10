import { getSkyLuminance } from "./luminance-equation";
import {
	vec3,
	instanceIndex,
	Fn,
	color,
	vec2,
	float,
	texture,
	textureStore,
	PI,
	uvec2,
	cos,
	sin,
	sqrt,
	positionLocal,
	abs,
	max,
	If,
	not,
	textureLoad,
} from "three/tsl";
import { getCoordinatesOnFace, getUVOnFace } from "./cubemap-helper";
import {
	HEIGHT,
	WIDTH,
	luminanceStorageTexture,
	luminanceStorageCubemap,
} from "./constants";

// EQUIRECTANGULAR PROJECTION
// https://www.researchgate.net/publication/328011848_Scalable_Omnidirectional_Video_Coding_for_Real-Time_Virtual_Reality_Applications

export const computeLuminanceTexture = Fn(({ nevg, sunDir }) => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH);
	const indexUV = uvec2(indX, indY);

	const theta = float(indX).div(float(WIDTH)).mul(PI).mul(2).sub(PI);
	const phi = float(indY).div(float(HEIGHT)).mul(PI).sub(PI.div(2));

	const posX = cos(theta).mul(cos(phi));
	const posY = sin(phi);
	const posZ = sin(theta).mul(cos(phi));
	const position = vec3(posX, posY, posZ);

	const sunDirection = vec3(sunDir.x, sunDir.y, sunDir.z);
	const baseLuminance = getSkyLuminance(position, sunDirection, nevg);
	const lva = float(baseLuminance).mul(0.0001);

	const white = color(1.0, 1.0, 1.0, 1.0);
	const skyColor = white.mul(float(lva));

	textureStore(luminanceStorageTexture, indexUV, skyColor).toWriteOnly();
});

export function getLuminanceTexture() {
	return texture(luminanceStorageTexture);
}

// CUBEMAP

// TRIGONOMETRIC IMPLEMENTATION
// https://docs.unity3d.com/ru/530/Manual/class-Cubemap.html

export const computeLuminanceCubemapTrigonometric = Fn(({ nevg, sunDir }) => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

	let color, indexUV;
	const w = float(WIDTH);
	const h = float(HEIGHT);

	// +x
	color = getColorOnSideTrigonometric(nevg, sunDir, 0, PI.div(2));
	indexUV = uvec2(w.mul(2).add(indX), h.mul(1).add(indY));
	textureStore(luminanceStorageCubemap, indexUV, color).toWriteOnly();

	// -x
	color = getColorOnSideTrigonometric(nevg, sunDir, 0, PI.div(2).mul(3));
	indexUV = uvec2(w.mul(0).add(indX), h.mul(1).add(indY));
	textureStore(luminanceStorageCubemap, indexUV, color).toWriteOnly();

	// +y
	color = getColorOnSideTrigonometric(nevg, sunDir, PI.div(2), 0);
	indexUV = uvec2(w.mul(1).add(indX), h.mul(2).add(indY));
	textureStore(luminanceStorageCubemap, indexUV, color).toWriteOnly();

	// -y
	color = getColorOnSideTrigonometric(nevg, sunDir, PI.div(2).mul(3), 0);
	indexUV = uvec2(w.mul(1).add(indX), h.mul(0).add(indY));
	textureStore(luminanceStorageCubemap, indexUV, color).toWriteOnly();

	// +z
	color = getColorOnSideTrigonometric(nevg, sunDir, 0, 0);
	indexUV = uvec2(w.mul(1).add(indX), h.mul(1).add(indY));
	textureStore(luminanceStorageCubemap, indexUV, color).toWriteOnly();

	//-z
	color = getColorOnSideTrigonometric(nevg, sunDir, 0, PI);
	indexUV = uvec2(w.mul(3).add(indX), h.mul(1).add(indY));
	textureStore(luminanceStorageCubemap, indexUV, color).toWriteOnly();
});

const getColorOnSideTrigonometric = Fn(
	({ nevg, sunDir, sidePhi, sideTheta }) => {
		const indX = instanceIndex.mod(WIDTH);
		const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

		const theta = sideTheta.add(
			float(indX).div(float(WIDTH)).mul(PI.div(2)).sub(PI.div(4)),
		);
		const phi = sidePhi.add(
			float(indY).div(float(HEIGHT)).mul(PI.div(2)).sub(PI.div(4)),
		);

		const posX = cos(theta).mul(cos(phi));
		const posY = sin(phi);
		const posZ = sin(theta).mul(cos(phi));
		const position = vec3(posX, posY, posZ);

		const sunDirection = vec3(sunDir.x, sunDir.y, sunDir.z);
		const baseLuminance = getSkyLuminance(position, sunDirection, nevg);
		const lva = float(baseLuminance).mul(0.0001);

		const white = color(1.0, 1.0, 1.0, 1.0);
		const skyColor = white.mul(float(lva));

		return skyColor;
	},
);

// PROJECTION IMPLEMENTATION
// https://nsucgcourse.github.io/lectures/Lecture13/Slide_13_Valeev_Rays.pdf

export const computeLuminanceCubemap = Fn(({ nevg, sunDir }) => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH * 4).mod(HEIGHT);

	let color, indexUV;
	const w = float(WIDTH);
	const h = float(HEIGHT);

	for (let face = 0; face < 6; face++) {
		color = getColorOnSide(nevg, sunDir, face);
		indexUV = getUVOnFace(face, indX, indY, w, h);
		textureStore(luminanceStorageCubemap, indexUV, color).toReadWrite();
	}
});

const getColorOnSide = Fn(({ nevg, sunDir, face }) => {
	const indX = float(instanceIndex.mod(WIDTH));
	const indY = float(instanceIndex.div(WIDTH * 4).mod(HEIGHT));

	const r = float(WIDTH).div(2);
	const rd = getCoordinatesOnFace(face, indX, indY, r);
	const rdLen = sqrt(rd.x.mul(rd.x).add(rd.y.mul(rd.y)).add(rd.z.mul(rd.z)));
	const t = r.div(rdLen);

	const position = rd.div(rdLen).mul(t);

	const sunDirection = vec3(sunDir.x, sunDir.y, sunDir.z);
	const baseLuminance = getSkyLuminance(position, sunDirection, nevg);
	const lva = float(baseLuminance).mul(0.0001);

	const white = color(1.0, 1.0, 1.0, 1.0);
	const skyColor = white.mul(float(lva));

	return skyColor;
});

export const getColorFromCubemap = Fn(() => {
	const p = positionLocal;
	const pPos = vec3(abs(p.x), abs(p.y), abs(p.z));
	const maxCoord = max(max(pPos.x, pPos.y), pPos.z);

	const w = float(WIDTH);
	const h = float(HEIGHT);
	const r = float(WIDTH).div(2);

	let indexUV = vec2(0, 0);

	If(pPos.x.equal(maxCoord).and(not(p.x.equal(pPos.x))), () => {
		const t = r.div(p.x);
		const indX = p.z.mul(t).add(r);
		const indY = p.y.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(0, indX, indY, w, h));
	});

	If(pPos.x.equal(maxCoord).and(not(p.x.notEqual(pPos.x))), () => {
		const t = r.div(p.x);
		const indX = p.z.mul(t).add(r);
		const indY = p.y.mul(t).add(r);
		indexUV.assign(getUVOnFace(1, indX, indY, w, h));
	});

	If(pPos.y.equal(maxCoord).and(p.y.equal(pPos.y)), () => {
		const t = r.div(p.y);
		const indX = p.x.mul(-1).mul(t).add(r);
		const indY = p.z.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(2, indX, indY, w, h));
	});

	If(pPos.y.equal(maxCoord).and(p.y.notEqual(pPos.y)), () => {
		const t = r.div(p.y);
		const indX = p.x.mul(t).add(r);
		const indY = p.z.mul(t).add(r);
		indexUV.assign(getUVOnFace(3, indX, indY, w, h));
	});

	If(pPos.z.equal(maxCoord).and(p.z.equal(pPos.z)), () => {
		const t = r.div(p.z);
		const indX = p.x.mul(-1).mul(t).add(r);
		const indY = p.y.mul(t).add(r);
		indexUV.assign(getUVOnFace(4, indX, indY, w, h));
	});

	If(pPos.z.equal(maxCoord).and(p.z.notEqual(pPos.z)), () => {
		const t = r.div(p.z);
		const indX = p.x.mul(-1).mul(t).add(r);
		const indY = p.y.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(5, indX, indY, w, h));
	});

	return textureLoad(luminanceStorageCubemap, indexUV);
});

export function getLuminanceCubemap() {
	return texture(luminanceStorageCubemap);
}
