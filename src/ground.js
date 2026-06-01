import * as THREE from "three/webgpu";

import { float, positionLocal, vec3, vec4 } from "three/tsl";

export class Ground {
	constructor(radius, segments, groundColor) {
		this.radius = radius;
		this.segments = segments;
		const tempGroundColor = new THREE.Color(groundColor);
		this.groundColor = vec3(
			tempGroundColor.r,
			tempGroundColor.g,
			tempGroundColor.b,
		);
		this.update();
	}

	update() {
		if (this.mesh && this.scene) {
			this.scene.remove(this.mesh);
			this.scene.remove(this.meshLower);
		}

		this.geometry = this.getGeometry(this.radius, this.segments);
		this.material = this.getMaterial(this.isWireframe);
		this.mesh = this.getMesh(this.geometry, this.material);

		this.geometryLower = this.getGeometry(this.radius * 10, this.segments);
		this.materialLower = this.getMaterial(this.isWireframe);
		this.meshLower = this.getMesh(this.geometryLower, this.materialLower);
		this.meshLower.position.set(0, -0.1, 0);

		if (this.scene) {
			this.scene.add(this.mesh);
			this.scene.add(this.meshLower);
		}
	}

	setScene(scene) {
		this.scene = scene;
		this.scene.add(this.mesh);
		this.scene.add(this.meshLower);
	}

	ColorNodeTransparent() {
		const groundColor = this.groundColor;
		const distanceSquared = positionLocal.x.pow(2).add(positionLocal.y.pow(2));
		const strength = distanceSquared.div(this.radius).div(this.radius);
		const alpha = float(1).sub(float(strength)).smoothstep(0.5, 1);
		return vec4(groundColor, alpha);
	}

	ColorNode() {
		return vec4(this.groundColor, 1.0);
	}

	getGeometry(radius, segments) {
		return new THREE.CircleGeometry(radius, segments);
	}

	getMaterial() {
		const material = new THREE.MeshLambertNodeMaterial();
		material.colorNode = this.ColorNode();
		//material.transparent = true;
		return material;
	}

	getMesh(geometry, material) {
		const plane = new THREE.Mesh(geometry, material);
		plane.rotateX(-Math.PI / 2);
		plane.receiveShadow = true;
		return plane;
	}

	setMaterialOutputNode(computeValue) {
		this.material.outputNode = computeValue();
		this.material.needsUpdate = true;
	}
}
