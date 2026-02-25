import {
	vec3,
	Fn,
	uvec2,
	array,
	If,
	float,
	uint,
	int,
	abs,
	max,
	vec2,
	normalWorld,
} from "three/tsl";

// +x -x +y -y +z -z

// which coordinate should use: indX, indY and radius
const faceCoordinate = array([
	vec3(0, 0, -1),
	vec3(0, 1, 0),
	vec3(1, 0, 0),

	vec3(0, 0, 1),
	vec3(0, 1, 0),
	vec3(-1, 0, 0),

	vec3(1, 0, 0),
	vec3(0, 0, -1),
	vec3(0, 1, 0),

	vec3(1, 0, 0),
	vec3(0, 0, 1),
	vec3(0, -1, 0),

	vec3(1, 0, 0),
	vec3(0, 1, 0),
	vec3(0, 0, 1),

	vec3(-1, 0, 0),
	vec3(0, 1, 0),
	vec3(0, 0, -1),
]);

// how to multiply width and height to get start of face area in cubemap
const faceIndexUV = array([
	uvec2(2, 1),
	uvec2(0, 1),
	uvec2(1, 2),
	uvec2(1, 0),
	uvec2(1, 1),
	uvec2(3, 1),
]);

export const getCoordinatesOnFace = Fn(({ face, indX, indY, r }) => {
	const indA = uint(face).mul(3).add(0);
	const indB = uint(face).mul(3).add(1);
	const indC = uint(face).mul(3).add(2);

	const maskA = faceCoordinate.element(indA);
	const maskB = faceCoordinate.element(indB);
	const maskC = faceCoordinate.element(indC);

	const a = maskA.mul(int(indX).sub(r));
	const b = maskB.mul(int(indY).sub(r));
	return maskC.mul(r).add(a).add(b);
});

export const getUVOnFace = Fn(({ face, indX, indY, width, height }) => {
	const faceUV = faceIndexUV.element(face);
	const u = uint(width).mul(faceUV.x).add(indX);
	const v = uint(height).mul(faceUV.y).add(indY);
	return uvec2(u, v);
});

export const getFace = Fn(({ index, segmentWidth, segmentHeight }) => {
	const w = uint(segmentWidth);
	const h = uint(segmentHeight);
	const indX = index.mod(w.mul(4));
	const indY = index.div(w.mul(4));
	let face = int(-1);

	// middle line
	If(indY.greaterThanEqual(h.mul(1)).and(indY.lessThan(h.mul(2))), () => {
		If(indX.lessThan(w.mul(1)), () => {
			face.assign(1);
		})
			.ElseIf(indX.lessThan(w.mul(2)), () => {
				face.assign(4);
			})
			.ElseIf(indX.lessThan(w.mul(3)), () => {
				face.assign(0);
			})
			.ElseIf(indX.lessThan(w.mul(4)), () => {
				face.assign(5);
			});
	})
		// top line
		.ElseIf(indY.greaterThanEqual(h.mul(2)), () => {
			If(
				indX.greaterThanEqual(w.mul(1)).and(indX.lessThanEqual(w.mul(2))),
				() => {
					face.assign(2);
				},
			);
		})
		// bottom line
		.ElseIf(indY.lessThan(h.mul(1)), () => {
			If(
				indX.greaterThanEqual(w.mul(1)).and(indX.lessThanEqual(w.mul(2))),
				() => {
					face.assign(3);
				},
			);
		});

	return face;
});

export const getUVForLocalNormal = Fn(({ width, height }) => {
	// to avoid flickering
	const QUANTIZE = 1.0e6;
	const p = normalWorld
		.mul(QUANTIZE)
		.round()
		.div(QUANTIZE)
		.mul(vec3(-1, 1, 1));

	const pPos = vec3(abs(p.x), abs(p.y), abs(p.z));
	const maxCoord = max(max(pPos.x, pPos.y), pPos.z);

	const w = float(width);
	const h = float(height);
	const r = float(width).div(2);

	let indexUV = vec2(0, 0);

	If(pPos.x.equal(maxCoord).and(p.x.equal(pPos.x)), () => {
		const t = r.div(p.x);
		const indX = p.z.mul(t).add(r);
		const indY = p.y.mul(t).add(r);
		indexUV.assign(getUVOnFace(1, indX, indY, w, h));
	});

	If(pPos.x.equal(maxCoord).and(p.x.notEqual(pPos.x)), () => {
		const t = r.div(p.x);
		const indX = p.z.mul(t).add(r);
		const indY = p.y.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(0, indX, indY, w, h));
	});

	If(pPos.y.equal(maxCoord).and(p.y.equal(pPos.y)), () => {
		const t = r.div(p.y);
		const indX = p.x.mul(-1).mul(t).add(r);
		const indY = p.z.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(2, indX, indY, w, h));
	});

	If(pPos.y.equal(maxCoord).and(p.y.notEqual(pPos.y)), () => {
		const t = r.div(p.y);
		const indX = p.x.mul(t).add(r);
		const indY = p.z.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(3, indX, indY, w, h));
	});

	If(pPos.z.equal(maxCoord).and(p.z.equal(pPos.z)), () => {
		const t = r.div(p.z);
		const indX = p.x.mul(-1).mul(t).add(r);
		const indY = p.y.mul(t).add(r);
		indexUV.assign(getUVOnFace(4, indX, indY, w, h));
	});

	If(pPos.z.equal(maxCoord).and(p.z.notEqual(pPos.z)), () => {
		const t = r.div(p.z);
		const indX = p.x.mul(-1).mul(t).add(r);
		const indY = p.y.mul(-1).mul(t).add(r);
		indexUV.assign(getUVOnFace(5, indX, indY, w, h));
	});

	return indexUV;
});
