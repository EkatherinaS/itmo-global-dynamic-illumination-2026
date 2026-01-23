import * as THREE from "three/webgpu";

import {
	positionLocal,
	normalLocal,
	vec3,
	vec4,
	float,
	uniform,
} from "three/tsl";

export class Ground {
	constructor(radius, segments, groundColor) {
		this.radius = radius;
		this.segments = segments;
		const tempGroundColor = new THREE.Color(groundColor);
		this.groundColor = uniform(
			vec3(tempGroundColor.r, tempGroundColor.g, tempGroundColor.b)
		);
		this.update();
	}

	update() {
		if (this.mesh && this.scene) {
			this.scene.remove(this.mesh);
		}

		this.geometry = this.getGeometry(this.radius, this.segments);
		this.material = this.getMaterial(this.isWireframe);
		this.mesh = this.getMesh(this.geometry, this.material);

		if (this.scene) {
			this.scene.add(this.mesh);
		}
	}

	setScene(scene) {
		this.scene = scene;
		this.scene.add(this.mesh);
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
		const groundColor = this.groundColor;
		const distanceSquared = positionLocal.x.pow(2).add(positionLocal.y.pow(2));
		const strength = distanceSquared.div(this.radius).div(this.radius);
		const alpha = float(1).sub(float(strength)).smoothstep(0.5, 1);
		return vec4(groundColor, alpha);
	}

	PositionNode() {
		return positionLocal;
	}

	NormalNode() {
		return normalLocal;
	}

	getGeometry(radius, segments) {
		return new THREE.CircleGeometry(radius, segments);
	}

	getMaterial() {
		const material = new THREE.MeshLambertMaterial();
		material.positionNode = this.PositionNode();
		material.colorNode = this.ColorNode();
		material.normalNode = this.NormalNode();
		material.transparent = true;
		return material;
	}

	getMesh(geometry, material) {
		const plane = new THREE.Mesh(geometry, material);
		plane.rotateX(-Math.PI / 2);
		plane.receiveShadow = true;
		return plane;
	}
}
