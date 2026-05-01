import { probePositions, sphericalHarmonics } from "./constants";
import {
	div,
	mod,
	storage,
	uint,
	uniform,
	vec3,
	Fn,
	instanceIndex,
	positionLocal,
	vec4,
	float,
	materialColor,
	negate,
	positionWorld,
	distance,
	color,
	output,
	Loop,
	max,
	array,
} from "three/tsl";

export const computeGlobalLight = Fn(() => {
	const shCoefficients = storage(sphericalHarmonics, "vec3", 36);
	const dir = negate(positionLocal.normalize());

	const x = float(dir.x);
	const y = float(dir.y);
	const z = float(dir.z);

	const shBasis = array([
		float(0.282095),
		float(0.488603).mul(y),
		float(0.488603).mul(z),
		float(0.488603).mul(x),
		float(1.092548).mul(x).mul(y),
		float(1.092548).mul(y).mul(z),
		float(0.315392).mul(float(3).mul(z).mul(z).sub(1)),
		float(1.092548).mul(x).mul(z),
		float(0.546274).mul(x.mul(x).sub(y.mul(y))),
	]);

	const result = vec3(0);
	const probes = storage(probePositions, "vec3", 4);

	Loop(4, 9, ({ i, j }) => {
		const probeInd = uint(i);
		const coefInd = uint(j);
		const shCoeff = vec4(
			shCoefficients.element(probeInd.mul(9).add(coefInd)),
			1.0,
		);
		const dist = max(
			float(1)
				.div(distance(positionWorld, probes.element(probeInd)))
				.mul(0.1),
			0.000001,
		);
		result.addAssign(shCoeff.mul(shBasis.element(coefInd)).mul(dist));
	});

	return output.add(result); //vec4(positionWorld.mul(0.01), 1.0);
});
