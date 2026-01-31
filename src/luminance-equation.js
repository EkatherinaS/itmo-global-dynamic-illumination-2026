import {
	acos,
	asin,
	float,
	log,
	exp,
	pow,
	sin,
	cos,
	PI,
	clamp,
	dot,
} from "three/tsl";

// https://publications.ibpsa.org/proceedings/bs/1999/papers/bs1999_PB-01.pdf

function Luz(gamma_s, Nevg) {
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
	return exp(
		A.mul(pow(Nevg, float(5)))
			.add(B.mul(pow(Nevg, float(4))))
			.add(C.mul(pow(Nevg, float(3))))
			.add(D.mul(pow(Nevg, float(2))))
			.add(E.mul(Nevg))
			.add(F),
	);
}

function phi(gamma, Nevg) {
	const a = float(9.93)
		.mul(pow(Nevg, 3))
		.add(float(-10.68).mul(pow(Nevg, 2)))
		.add(float(7.09).mul(Nevg))
		.add(float(-2.11));
	return float(1).add(float(a).mul(float(1).sub(pow(sin(gamma), float(0.6)))));
}

function f(xi, Nevg) {
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

	return float(1)
		.add(
			float(b).mul(
				exp(float(c).mul(xi)).sub(exp(float(c).mul(PI.div(float(2))))),
			),
		)
		.add(float(d).mul(pow(cos(xi), float(2))));
}

function Lva(gamma_s, gamma, xi, Nevg) {
	return phi(gamma, Nevg)
		.mul(f(xi, Nevg))
		.mul(Luz(gamma_s, Nevg))
		.div(
			phi(PI.div(float(2)), Nevg).mul(f(PI.div(float(2)).sub(gamma_s), Nevg)),
		);
}

export function getSkyLuminance(position, sunDir, nevg) {
	const sunDirection = sunDir.normalize();
	const localDirection = position.normalize();
	const gamma = asin(clamp(localDirection.y, float(-1), float(1)));
	const gamma_s = asin(clamp(sunDirection.y, float(-1), float(1)));
	const xi = acos(
		clamp(dot(sunDirection, localDirection), float(-1), float(1)),
	);
	return Lva(gamma_s, gamma, xi, nevg);
}
