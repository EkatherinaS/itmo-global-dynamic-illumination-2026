import {
	Fn,
	Loop,
	PI,
	color,
	cos,
	float,
	instanceIndex,
	sin,
	sqrt,
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
	luminanceStorageCubemap,
	luminanceStorageTexture,
} from "./constants";
import {
	getCoordinatesOnFace,
	getUVForLocalNormal,
	getUVOnFace,
} from "./cubemap-helper";
import { getSkyLuminance } from "./luminance-equation";

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
	Loop(6, ({ i }) => {
		const face = uint(i);
		color = getColorOnSide(nevg, sunDir, face);
		indexUV = getUVOnFace(face, indX, indY, w, h);
		textureStore(luminanceStorageCubemap, indexUV, color);
	});
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
	const lva = float(baseLuminance).div(WIDTH * HEIGHT * 6);

	const white = color(1.0, 1.0, 1.0, 1.0);
	const skyColor = white.mul(float(lva));

	return skyColor;
});

export const getLuminanceColor = Fn(() => {
	const indexUV = getUVForLocalNormal(WIDTH, HEIGHT);
	return textureLoad(luminanceStorageCubemap, indexUV);
});

export function getLuminanceCubemap() {
	return texture(luminanceStorageCubemap);
}
