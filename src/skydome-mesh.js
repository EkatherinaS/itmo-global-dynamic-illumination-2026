import * as THREE from "three/webgpu";
import { Gyroscope } from "three/addons/misc/Gyroscope.js";

import {
	positionLocal,
	negate,
	normalLocal,
	vec3,
	vec4,
	float,
	select,
	uniform,
	color,
	min,
	fog,
	abs,
	positionView,
	positionWorld,
} from "three/tsl";

// https://publications.ibpsa.org/proceedings/bs/1999/papers/bs1999_PB-01.pdf

export class SkydomeMesh {
	constructor(skydome, radius, detail, skyColor, groundColor) {
		this.radius = radius;
		this.detail = detail;
		this.skydome = skydome;

		const tempSkyColor = new THREE.Color(skyColor);
		const tempGroundColor = new THREE.Color(groundColor);

		this.skyColor = uniform(
			vec3(tempSkyColor.r, tempSkyColor.g, tempSkyColor.b)
		);
		this.groundColor = uniform(
			vec3(tempGroundColor.r, tempGroundColor.g, tempGroundColor.b)
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

		this.geometry = this.getIcosahedronGeometry(this.radius, this.detail);
		this.material = this.getMaterial(this.isWireframe);
		this.mesh = this.getMesh(this.geometry, this.material);

		if (this.gyro && !this.isBackground) {
			this.gyro.add(this.mesh);
		}
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
			tempGroundColor.b
		);
		this.update();
	}

	getSkyColor() {
		const lva = this.skydome.getSkyLuminance(positionLocal);
		return this.skyColor.add(this.white.mul(float(lva).mul(float(0.0001))));
	}

	ColorNode() {
		const skyColor = this.getSkyColor();
		const groundColor = this.groundColor;

		const strength = min(
			positionWorld.y.div(this.radius),
			positionLocal.y.div(this.radius)
		);
		const alpha = float(strength).smoothstep(0, 0.2);

		const ground = this.isBackground
			? vec4(groundColor, float(1))
			: vec4(0, 0, 0, 0);
		const sky = this.isBackground
			? positionLocal.y
					.smoothstep(0, 0.1)
					.mix(vec4(groundColor, float(1)), vec4(skyColor, float(1)))
			: vec4(skyColor, float(alpha));

		return select(positionLocal.y.lessThan(float(0)), ground, sky);
	}

	PositionNode() {
		return positionLocal;
	}

	NormalNode() {
		return negate(normalLocal);
	}

	getSphereGeometry(radius, detail) {
		const geometry = new THREE.SphereGeometry(radius, detail, detail);
		geometry.scale(-1, 1, 1);
		geometry.computeVertexNormals();
		return geometry;
	}

	getIcosahedronGeometry(radius, detail) {
		const geometry = new THREE.IcosahedronGeometry(radius, detail);
		geometry.scale(-1, 1, 1);
		geometry.computeVertexNormals();
		return geometry;
	}

	setWireframe(isWireframe) {
		this.isWireframe = isWireframe;
		this.update();
	}

	setBackground(isBackground) {
		this.isBackground = isBackground;
		if (isBackground) {
			this.scene.backgroundNode = this.ColorNode();
			if (this.gyro) this.gyro.remove(this.mesh);
			this.setUpFog();
		} else {
			this.scene.backgroundNode = color(this.skyColor);
			this.setUpFog();
		}
		this.update();
	}

	setUpFog() {
		const skyColor = color(this.skyColor);
		const groundColor = color(this.groundColor);

		const fogNoiseDistance = abs(positionView.z)
			.sub(positionWorld.y)
			.div(this.radius)
			.clamp(0, 1)
			.smoothstep(0.8, 1);
		const groundFogArea = float(fogNoiseDistance).saturate();

		const fogColor = this.isBackground ? groundColor : skyColor;
		this.scene.fogNode = fog(fogColor, groundFogArea);
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

	getMesh(geometry, material) {
		return new THREE.Mesh(geometry, material);
	}
}

// const loader = new THREE.TextureLoader();
// const skyTexture = loader.load("public/textures/dawn.jpg");
// const skyTexNode = texture(skyTexture);
// const color = skyTexNode.sample(uv());
