import { Gyroscope } from "three/addons/misc/Gyroscope.js";
import * as THREE from "three/webgpu";
import { getSkyLuminance } from "./luminance-equation";

import {
	abs,
	color,
	float,
	fog,
	length,
	min,
	negate,
	normalLocal,
	positionLocal,
	positionView,
	positionWorld,
	uniform,
	vec3,
	vec4,
} from "three/tsl";

// https://publications.ibpsa.org/proceedings/bs/1999/papers/bs1999_PB-01.pdf

export class Skydome {
	constructor(sunDirection, nevg, radius, detail, skyColor, groundColor) {
		this.radius = radius;
		this.detail = detail;

		const tempSkyColor = new THREE.Color(skyColor);
		const tempGroundColor = new THREE.Color(groundColor);

		this.nevg = uniform(float(nevg));
		this.sunDirection = uniform(
			vec3(sunDirection.x, sunDirection.y, sunDirection.z),
		);

		this.skyColor = uniform(
			vec3(tempSkyColor.r, tempSkyColor.g, tempSkyColor.b),
		);
		this.groundColor = uniform(
			vec3(tempGroundColor.r, tempGroundColor.g, tempGroundColor.b),
		);
		this.halfsphere = groundColor == null;

		this.isWireframe = false;
		this.isBackground = false;
		this.white = color(1, 1, 1, 1);

		this.update();
	}

	update() {
		if (this.mesh && this.gyro && !this.isBackground) {
			this.gyro.remove(this.mesh);
		}

		this.geometry = this.getIcosahedronGeometry();
		this.material = this.getMaterial();
		this.mesh = this.getMesh();

		if (this.gyro && !this.isBackground) {
			this.gyro.add(this.mesh);
		}
	}

	ColorNode() {
		const skyColor = this.getSkyColor();
		const strength = min(
			positionWorld.y.div(this.radius),
			positionLocal.y.div(this.radius),
		);
		const alpha = float(strength).smoothstep(0, 0.2);
		return vec4(skyColor, float(alpha));
	}

	PositionNode() {
		return positionLocal;
	}

	NormalNode() {
		return negate(normalLocal);
	}

	getSkyColor() {
		const pos = vec3(positionLocal.x, abs(positionLocal.y), positionLocal.z);
		const lva = getSkyLuminance(pos, this.sunDirection, this.nevg);
		return this.skyColor.add(this.white.mul(float(lva).mul(float(0.0001))));
	}

	getSphereGeometry() {
		const geometry = new THREE.SphereGeometry(
			this.radius,
			this.detail,
			this.detail,
		);
		geometry.scale(-1, 1, 1);
		geometry.computeVertexNormals();
		return geometry;
	}

	getIcosahedronGeometry() {
		const geometry = new THREE.IcosahedronGeometry(this.radius, this.detail);
		geometry.scale(-1, 1, 1);
		geometry.computeVertexNormals();
		return geometry;
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
			material.transparent = true;
			return material;
		}
	}

	getMesh() {
		return new THREE.Mesh(this.geometry, this.material);
	}

	setSunDirection(sunDirection) {
		this.sunDirection.value.set(sunDirection.x, sunDirection.y, sunDirection.z);
	}

	setNevg(nevg) {
		this.nevg.value = nevg;
	}

	setScene(scene) {
		this.scene = scene;
		this.setBackground(this.isBackground);
	}

	setCamera(camera) {
		this.camera = camera;
		this.gyro = new Gyroscope();
		this.gyro.position.set(0, -this.radius / 4, 0);
		this.camera.add(this.gyro);
		if (!this.isBackground) this.gyro.add(this.mesh);
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
			tempGroundColor.b,
		);
		this.update();
	}

	setWireframe(isWireframe) {
		this.isWireframe = isWireframe;
		this.update();
	}

	setBackground(isBackground) {
		this.isBackground = isBackground;
		this.scene.backgroundNode = this.ColorNode();
		if (isBackground && this.gyro) this.gyro.remove(this.mesh);
		this.setUpFog();
		this.update();
	}

	setUpFog() {
		const skyColor = color(this.skyColor);
		const groundColor = color(this.groundColor);
		const r = float(this.radius);

		const fogNoiseDistance = length(positionView.add(vec3(0, r.mul(0.25), 0)))
			.sub(r.mul(0.75))
			.div(r)
			.clamp(0, 1)
			.smoothstep(0.3, 1);
		const groundFogArea = float(fogNoiseDistance).saturate();

		this.scene.fogNode = fog(skyColor, groundFogArea);
	}
}

// const loader = new THREE.TextureLoader();
// const skyTexture = loader.load("public/textures/dawn.jpg");
// const skyTexNode = texture(skyTexture);
// const color = skyTexNode.sample(uv());
