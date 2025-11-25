import { DxfParser } from "dxf-parser";
import * as THREE from "three/webgpu";

class Polyline {
	static TYPE = "LWPOLYLINE";
	constructor(_vertices) {
		this.vertices = _vertices;
	}

	getType() {
		return this.type;
	}

	getBoundingBox() {
		if (this.boundingBox) return this.boundingBox;

		let minX = this.vertices[0].x;
		let minY = this.vertices[0].y;
		let maxX = this.vertices[0].x;
		let maxY = this.vertices[0].y;
		this.vertices.forEach((v) => {
			if (v.x < minX) minX = v.x;
			if (v.y < minY) minY = v.y;
			if (v.x > maxX) maxX = v.x;
			if (v.y > maxY) maxY = v.y;
		});
		this.boundingBox = {
			min: { x: minX, y: minY },
			max: { x: maxX, y: maxY },
		};
		return this.boundingBox;
	}
	getGeometry() {
		const shape = new THREE.Shape();
		const verts = this.vertices;

		if (verts.length === 0) return null;

		shape.moveTo(verts[0].x, verts[0].y);

		for (let i = 1; i < verts.length; i++) {
			shape.lineTo(verts[i].x, verts[i].y);
		}

		const extrudeSettings = {
			steps: 1,
			depth: 40 + Math.random() * 100,
			bevelEnabled: false,
		};

		return new THREE.ExtrudeGeometry(shape, extrudeSettings);
	}
}

class Model {
	constructor(_entities) {
		this.entities = _entities;
		this.polylines = this.getPolylines();
		this.model = this.getModel();
	}

	getPolylines() {
		const polylines = [];
		this.entities.forEach((entity) => {
			if (entity.type == Polyline.TYPE) {
				const polyline = new Polyline(entity.vertices);
				polylines.push(polyline);
			} else {
				console.warn("Not implemented handler for type:", entity.type);
			}
		});
		return polylines;
	}

	getBoundingBox() {
		if (this.boundingBox) return this.boundingBox;

		let bb = this.polylines[0].getBoundingBox();
		let minX = bb.min.x;
		let minY = bb.min.y;
		let maxX = bb.max.x;
		let maxY = bb.max.y;

		this.polylines.forEach((polyline) => {
			bb = polyline.getBoundingBox();
			if (bb.min.x < minX) minX = bb.min.x;
			if (bb.min.y < minY) minY = bb.min.y;
			if (bb.max.x > maxX) maxX = bb.max.x;
			if (bb.max.y > maxY) maxY = bb.max.y;
		});

		this.boundingBox = {
			min: { x: minX, y: minY },
			max: { x: maxX, y: maxY },
		};
		return this.boundingBox;
	}

	optimizePolylines() {
		const boundingBox = this.getBoundingBox();
		this.polylines.forEach((polyline) => {
			polyline.vertices.forEach((vertex) => {
				vertex.x -= boundingBox.min.x;
				vertex.y -= boundingBox.min.y;
			});
		});
	}

	getModel() {
		this.optimizePolylines();
		const group = new THREE.Group();
		this.polylines.forEach((polyline) => {
			const color = new THREE.Color();
			color.setHSL(Math.random(), 1, 0.6);
			const material = new THREE.MeshPhongMaterial({
				color: color,
				flatShading: false,
			});
			const geometry = polyline.getGeometry();
			geometry.computeVertexNormals();
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			group.add(mesh);
		});
		return group;
	}
}

export class DXFLoader {
	load(url, onLoad, onProgress, onError) {
		const _onError = function (e) {
			if (onError) {
				onError(e);
			} else {
				console.error(e);
			}
		};

		const loader = new THREE.FileLoader(this.manager);
		loader.setPath(this.path);
		loader.setResponseType("string");
		loader.setRequestHeader(this.requestHeader);
		loader.setWithCredentials(this.withCredentials);

		const parser = new DxfParser();
		loader.load(
			url,
			function (data) {
				try {
					const dxf = parser.parseSync(data);
					const model = new Model(dxf.entities);
					onLoad(model);
				} catch (e) {
					_onError(e);
				}
			},
			onProgress,
			_onError
		);
	}
}
