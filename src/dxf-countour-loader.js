import * as THREE from "three/webgpu";
import DxfParser from "dxf-json";
import { getIrradianceColor } from "./irradiance-texture";
import { computeGlobalLight } from "./global-light";
import { Fn } from "three/src/nodes/TSL.js";
import { float, color } from "three/tsl";

class BoundingBox {
	constructor(x, y) {
		this.minX = x;
		this.minY = y;
		this.maxX = x;
		this.maxY = y;
	}

	includeVertex(vertex) {
		if (vertex.x < this.minX) this.minX = vertex.x;
		if (vertex.y < this.minY) this.minY = vertex.y;
		if (vertex.x > this.maxX) this.maxX = vertex.x;
		if (vertex.y > this.maxY) this.maxY = vertex.y;
	}

	includeBoundingBox(boundingBox) {
		if (boundingBox.minX < this.minX) this.minX = boundingBox.minX;
		if (boundingBox.minY < this.minY) this.minY = boundingBox.minY;
		if (boundingBox.maxX > this.maxX) this.maxX = boundingBox.maxX;
		if (boundingBox.maxY > this.maxY) this.maxY = boundingBox.maxY;
	}
}

class Polyline {
	static TYPE = "POLYLINE";

	constructor(_vertices) {
		this.vertices = _vertices;
		this.holes = [];
		this.boundingBox = null;
	}

	pushHole(vertices) {
		this.holes.push(vertices);
	}

	getBoundingBox() {
		if (this.boundingBox) return this.boundingBox;

		this.boundingBox = new BoundingBox(this.vertices[0].x, this.vertices[0].y);
		this.vertices.forEach((v) => {
			this.boundingBox.includeVertex(v);
		});
		return this.boundingBox;
	}

	_isCCW(points) {
		let area = 0;
		const n = points.length;
		for (let i = 0; i < n; i++) {
			const p1 = points[i];
			const p2 = points[(i + 1) % n];
			area += p1.x * p2.y - p2.x * p1.y;
		}
		return area > 0;
	}

	_getShape(vertices, isCCW) {
		if (vertices.length === 0) return null;

		const verts = vertices;
		const shape = new THREE.Shape();
		shape.autoClose = true;

		if (this._isCCW(verts) != isCCW) {
			verts.reverse();
		}

		shape.moveTo(verts[0].x, verts[0].y);
		for (let i = 1; i < verts.length; i++) {
			shape.lineTo(verts[i].x, verts[i].y);
		}
		return shape;
	}

	optimizeByBoundingBox(boundingBox) {
		for (let i = 0; i < this.vertices.length; i++) {
			this.vertices[i].x -= boundingBox.minX;
			this.vertices[i].y -= boundingBox.minY;
		}
		for (let i = 0; i < this.holes.length; i++) {
			for (let j = 0; j < this.holes[i].length; j++) {
				this.holes[i][j].x -= boundingBox.minX;
				this.holes[i][j].y -= boundingBox.minY;
			}
		}
	}

	getGeometry() {
		if (this.vertices.length === 0) return null;

		const shape = this._getShape(this.vertices, false);
		this.holes.forEach((hole) => {
			const holeShape = this._getShape(hole, true);
			shape.holes.push(holeShape);
		});

		const extrudeSettings = {
			steps: 1,
			depth: 50 + Math.random() * 30,
			bevelEnabled: true,
			bevelThickness: 1.2,
			bevelSegments: 16,
		};
		return new THREE.ExtrudeGeometry(shape, extrudeSettings);
	}
}

class Hatch {
	static TYPE = "HATCH";
	constructor(_entity) {
		this.entity = _entity;
	}

	getPolyline() {
		const polyline = new Polyline(this.entity.boundaryPaths[0].vertices);
		for (let i = 1; i < this.entity.boundaryPaths.length; i++) {
			polyline.pushHole(this.entity.boundaryPaths[i].vertices);
		}
		return polyline;
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
			if (entity.type == Hatch.TYPE) {
				const hatch = new Hatch(entity);
				const polyline = hatch.getPolyline();
				polylines.push(polyline);
			} else {
				//console.warn("Not implemented handler for type:", entity.type);
			}
		});
		return polylines;
	}

	getBoundingBox() {
		if (this.boundingBox) return this.boundingBox;

		let polylineBB = this.polylines[0].getBoundingBox();
		this.boundingBox = new BoundingBox(polylineBB.minX, polylineBB.minY);

		this.polylines.forEach((polyline) => {
			polylineBB = polyline.getBoundingBox();
			this.boundingBox.includeBoundingBox(polylineBB);
		});
		return this.boundingBox;
	}

	getModel() {
		const boundingBox = this.getBoundingBox();
		this.polylines.forEach((polyline) => {
			polyline.optimizeByBoundingBox(boundingBox);
		});

		const group = new THREE.Group();
		this.polylines.forEach((polyline) => {
			const randcolor = new THREE.Color();
			randcolor.setHSL(Math.random(), 1, 0.6);
			/*const material = new THREE.MeshPhongMaterial({
                //color: 0xffffff,
                color: color,
                flatShading: false,
            });*/
			const material = new THREE.MeshPhongNodeMaterial({
				color: randcolor,
				flatShading: false,
			});

			material.outputNode = computeGlobalLight();

			const geometry = polyline.getGeometry();
			geometry.computeVertexNormals();

			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
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

		loader.load(
			url,
			function (data) {
				try {
					const parser = new DxfParser();
					const dxf = parser.parseSync(data);
					const model = new Model(dxf.entities);
					onLoad(model);
				} catch (e) {
					_onError(e);
				}
			},
			onProgress,
			_onError,
		);
	}
}
