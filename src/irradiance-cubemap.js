import * as THREE from "three/webgpu";
import {
	vec3,
	instanceIndex,
	instancedArray,
	Fn,
	acos,
	asin,
	color,
	float,
	log,
	exp,
	pow,
	sin,
	cos,
	PI,
	clamp,
	storage,
	dot,
	textureStore,
	texture,
} from "three/tsl";

let sunDirection, count;
let positionBuffer, uvBuffer, irradienceBuffer;

export function initGeometry(radius, detail, sunDir) {
	const geometry = new THREE.IcosahedronGeometry(radius, detail);
	const positions = geometry.attributes.position;
	const uvs = geometry.attributes.uv;

	count = positions.count;
	sunDirection = vec3(sunDir.x, sunDir.y, sunDir.z);

	positionBuffer = storage(positions, "vec3", positions.count);
	uvBuffer = storage(uvs, "vec2", uvs.count);
	irradienceBuffer = instancedArray(count, "float");

	return count;
}

export const computeSkydom = Fn(({ Nevg }) => {
	const position = positionBuffer.element(instanceIndex);
	const irradience = irradienceBuffer.element(instanceIndex);
	const sunDir = sunDirection.normalize();

	const gamma = asin(clamp(position.y, float(-1), float(1)));
	const gamma_s = asin(clamp(sunDir.y, float(-1), float(1)));
	const xi = acos(clamp(dot(sunDir, position), float(-1), float(1)));

	const a = float(9.93)
		.mul(pow(Nevg, 3))
		.add(float(-10.68).mul(pow(Nevg, 2)))
		.add(float(7.09).mul(Nevg))
		.add(float(-2.11));

	const b = float(23.4)
		.mul(pow(float(1.6).mul(Nevg), float(5.9)))
		.mul(exp(float(-0.17).mul(Nevg)))
		.mul(pow(float(1.1).sub(Nevg), float(1.5)));

	const c = float(62.16)
		.mul(pow(Nevg, float(6)))
		.add(float(-257.62).mul(pow(Nevg, float(5))))
		.add(float(405.67).mul(pow(Nevg, float(4))))
		.add(float(-296.6).mul(pow(Nevg, float(3))))
		.add(float(99.3).mul(pow(Nevg, float(2))))
		.add(float(-16.34).mul(Nevg))
		.add(float(0.43));

	const d = float(2.06)
		.mul(pow(Nevg, float(5)))
		.add(float(-6.4).mul(pow(Nevg, float(4))))
		.add(float(6.02).mul(pow(Nevg, float(3))))
		.add(float(-1.31).mul(pow(Nevg, float(2))))
		.add(float(0.08).mul(Nevg));

	const phiGamma = float(1).add(
		float(a).mul(float(1).sub(pow(sin(gamma), float(0.6)))),
	);
	const phiPI = float(1).add(
		float(a).mul(float(1).sub(pow(sin(PI.div(float(2))), float(0.6)))),
	);

	const fXi = float(1)
		.add(
			float(b).mul(
				exp(float(c).mul(xi)).sub(exp(float(c).mul(PI.div(float(2))))),
			),
		)
		.add(float(d).mul(pow(cos(xi), float(2))));
	const fPI = float(1)
		.add(
			float(b).mul(
				exp(float(c).mul(PI.div(float(2)).sub(gamma_s))).sub(
					exp(float(c).mul(PI.div(float(2)))),
				),
			),
		)
		.add(float(d).mul(pow(cos(PI.div(float(2)).sub(gamma_s)), float(2))));

	const A = float(18.373).mul(gamma_s).add(float(9.955));
	const B = float(-52.013).mul(gamma_s).add(float(-37.766));
	const C = float(46.572).mul(gamma_s).add(float(59.352));
	const D = float(1.691)
		.mul(pow(gamma_s, float(2)))
		.add(float(-16.498))
		.mul(gamma_s)
		.add(float(-48.67));
	const E = float(1.124).mul(gamma_s).add(float(19.738));
	const F = float(1.17).mul(log(gamma_s)).add(float(6.369));
	const luz = exp(
		A.mul(pow(Nevg, float(5)))
			.add(B.mul(pow(Nevg, float(4))))
			.add(C.mul(pow(Nevg, float(3))))
			.add(D.mul(pow(Nevg, float(2))))
			.add(E.mul(Nevg))
			.add(F),
	);

	const baseIrradience = phiGamma.mul(fXi).mul(luz).div(phiPI.mul(fPI));
	irradience.assign(float(baseIrradience).mul(0.0001));
});

const size = 256;
const irradienceStorageTexture = new THREE.StorageTexture(size, size);
irradienceStorageTexture.minFilter = THREE.LinearMipMapLinearFilter;
export let irradienceTexture = {};

export const computeTexture = Fn(() => {
	const uv = uvBuffer.element(instanceIndex);
	const lva = irradienceBuffer.element(instanceIndex);

	const white = color(1.0, 1.0, 1.0, 1.0);
	const skyColor = white.mul(float(lva));
	const pixelCoord = uv.mul(size);

	textureStore(irradienceStorageTexture, pixelCoord, skyColor).toWriteOnly();
	irradienceTexture = texture(irradienceStorageTexture);
});
