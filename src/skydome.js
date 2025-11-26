import * as THREE from "three/webgpu";
import { texture, uv, positionLocal, negate, normalLocal } from "three/tsl";

export function ColorNode() {
	const loader = new THREE.TextureLoader();
	const skyTexture = loader.load("public/textures/dawn.jpg");
	const skyTexNode = texture(skyTexture);
	return skyTexNode.sample(uv());
}

function PositionNode() {
	return positionLocal;
}

function NormalNode() {
	return negate(normalLocal);
}

export class Skydome {
	constructor(radius, segments) {
		this.geometry = this.getGeometry(radius, segments);
		this.material = this.getMaterial();
		this.mesh = this.getMesh(this.geometry, this.material);
	}

	getGeometry(radius, segments) {
		const geometry = new THREE.SphereGeometry(radius, segments, segments);
		geometry.scale(-1, 1, 1);
		geometry.computeVertexNormals();
		return geometry;
	}

	getMaterial() {
		const material = new THREE.MeshBasicNodeMaterial();
		material.positionNode = PositionNode();
		material.colorNode = ColorNode();
		material.normalNode = NormalNode();
		return material;
	}

	getMesh(geometry, material) {
		return new THREE.Mesh(geometry, material);
	}
}
