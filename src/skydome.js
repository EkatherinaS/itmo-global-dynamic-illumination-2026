import * as THREE from "three/webgpu";
import { Gyroscope } from "three/addons/misc/Gyroscope.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

import {
	positionLocal,
	negate,
	normalLocal,
	vec3,
	vec4,
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
	select,
	uniform,
} from "three/tsl";

// https://publications.ibpsa.org/proceedings/bs/1999/papers/bs1999_PB-01.pdf

function Luz(gamma_s, Negv) {
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
		A.mul(pow(Negv, float(5)))
			.add(B.mul(pow(Negv, float(4))))
			.add(C.mul(pow(Negv, float(3))))
			.add(D.mul(pow(Negv, float(2))))
			.add(E.mul(Negv))
			.add(F)
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
				exp(float(c).mul(xi)).sub(exp(float(c).mul(PI.div(float(2)))))
			)
		)
		.add(float(d).mul(pow(cos(xi), float(2))));
}

function Lva(gamma_s, gamma, xi, Nevg) {
	return phi(gamma, Nevg)
		.mul(f(xi, Nevg))
		.mul(Luz(gamma_s, Nevg))
		.div(
			phi(PI.div(float(2)), Nevg).mul(f(PI.div(float(2)).sub(gamma_s), Nevg))
		);
}

export class Skydome {
	constructor(radius, segments, sunDirection, nevg, skyColor, groundColor) {
		this.radius = radius;
		this.segments = segments;

		const tempSkyColor = new THREE.Color(skyColor);
		const tempGroundColor = new THREE.Color(groundColor);

		this.skyColor = uniform(
			vec3(tempSkyColor.r, tempSkyColor.g, tempSkyColor.b)
		);
		this.groundColor = uniform(
			vec3(tempGroundColor.r, tempGroundColor.g, tempGroundColor.b)
		);
		this.halfsphere = groundColor == null;

		this.nevg = uniform(float(nevg));
		this.sunDirection = uniform(
			vec3(sunDirection.x, sunDirection.y, sunDirection.z)
		);
		this.white = uniform(vec3(1.0, 1.0, 1.0));
		this.isWireframe = false;

		this.update();
	}

	update() {
		if (this.mesh && this.gyro) {
			this.gyro.remove(this.mesh);
		}

		this.geometry = this.getGeometry(this.radius, this.segments);
		this.material = this.getMaterial(this.isWireframe);
		this.mesh = this.getMesh(this.geometry, this.material);

		if (this.gyro) {
			this.gyro.add(this.mesh);
		}
	}

	setCamera(camera) {
		this.camera = camera;
		this.gyro = new Gyroscope();
		this.gyro.position.set(0, -this.radius / 2, 0);
		this.camera.add(this.gyro);
		this.gyro.add(this.mesh);
	}

	setSunDirection(sunDirection) {
		this.sunDirection.value.set(sunDirection.x, sunDirection.y, sunDirection.z);
		this.update();
	}

	setNevg(nevg) {
		this.nevg.value = nevg;
		this.update();
	}

	setSkyColor(color) {
		const tempSkyColor = new THREE.Color(color);
		this.skyColor.value.set(tempSkyColor.r, tempSkyColor.g, tempSkyColor.b);
		this.update();
	}

	setHalfSphere(val) {
		this.halfsphere = val;
		this.update();
	}

	setGroundColor(color) {
		const tempGroundColor = new THREE.Color(color);
		this.groundColor.value.set(
			tempGroundColor.r,
			tempGroundColor.g,
			tempGroundColor.b
		);
		this.update();
	}

	ColorNode() {
		const sunDir = this.sunDirection.normalize();
		const localDir = positionLocal.normalize();

		const gamma = asin(clamp(localDir.y, float(-1), float(1)));
		const gamma_s = asin(clamp(sunDir.y, float(-1), float(1)));
		const xi = acos(clamp(dot(sunDir, localDir), float(-1), float(1)));
		const lva = Lva(gamma_s, gamma, xi, this.nevg);

		const groundColor = this.groundColor;
		const skyColor = this.skyColor.add(
			this.white.mul(float(lva).mul(float(0.0001)))
		);

		return select(
			gamma.lessThan(float(0)),
			vec4(groundColor, float(1)),
			vec4(skyColor, float(1))
		);
	}

	PositionNode() {
		return positionLocal;
	}

	NormalNode() {
		return negate(normalLocal);
	}

	getGeometry(radius, segments) {
		const halfsphere = new THREE.SphereGeometry(
			radius,
			segments,
			segments,
			0,
			Math.PI * 2,
			0,
			Math.PI * 0.5
		);
		/*
		const p1 = new THREE.Vector3(0, 0, 0);
		const p2 = this.camera ? this.camera.position : new THREE.Vector3(0, 1, 0);
		const path = new THREE.LineCurve3(p1, p2);
		console.log(path);
		const tube = new THREE.TubeGeometry(path);
		console.log(tube);

		const geometry = BufferGeometryUtils.mergeGeometries([halfsphere, tube]);
*/
		const geometry = halfsphere;
		geometry.scale(-1, 1, 1);
		geometry.computeVertexNormals();
		return geometry;
	}

	setWireframe(isWireframe) {
		this.isWireframe = isWireframe;
		this.update();
	}

	getMaterial() {
		if (this.isWireframe) {
			const material = new THREE.MeshBasicMaterial();
			material.wireframe = true;
			return material;
		} else {
			const material = new THREE.MeshBasicNodeMaterial();
			material.positionNode = this.PositionNode();
			material.colorNode = this.ColorNode();
			material.normalNode = this.NormalNode();
			return material;
		}
	}

	getMesh(geometry, material) {
		return new THREE.Mesh(geometry, material);
	}
}

// const loader = new THREE.TextureLoader();
// const skyTexture = loader.load("public/textures/dawn.jpg");
// const skyTexNode = texture(skyTexture);
// const color = skyTexNode.sample(uv());
