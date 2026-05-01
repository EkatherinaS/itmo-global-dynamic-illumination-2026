import { sphericalHarmonics } from "./constants";
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
} from "three/tsl";

export const computeGlobalLight = Fn(() => {
	const shCoefficients = storage(sphericalHarmonics, "float", 108);
	const dir = negate(positionLocal.normalize());

	const shBasis = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	const x = float(dir.x);
	const y = float(dir.y);
	const z = float(dir.z);

	const probe = vec3(2.8, 0.3, -2);
	const dist = float(1).div(distance(positionWorld, probe)).mul(0.1);

	shBasis[0] = float(0.282095); // 1/(2*sqrt(pi))
	shBasis[1] = float(0.488603).mul(y);
	shBasis[2] = float(0.488603).mul(z);
	shBasis[3] = float(0.488603).mul(x);
	shBasis[4] = float(1.092548).mul(x).mul(y);
	shBasis[5] = float(1.092548).mul(y).mul(z);
	shBasis[6] = float(0.315392).mul(float(3).mul(z).mul(z).sub(1));
	shBasis[7] = float(1.092548).mul(x).mul(z);
	shBasis[8] = float(0.546274).mul(x.mul(x).sub(y.mul(y)));

	let result = output;
	for (let i = 0; i < 9; i++) {
		const shCoeffs = vec4(
			shCoefficients.element(i * 3 + 0),
			shCoefficients.element(i * 3 + 1),
			shCoefficients.element(i * 3 + 2),
			1.0,
		);
		result = result.add(shCoeffs.mul(shBasis[i]).mul(dist));
	}

	return result; //vec4(positionWorld.mul(0.01), 1.0);
});
