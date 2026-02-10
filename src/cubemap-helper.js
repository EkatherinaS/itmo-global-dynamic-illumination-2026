import { vec3, Fn, uvec2, array, If, float, uint, int } from "three/tsl";

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
	const u = int(width).mul(faceUV.x).add(indX);
	const v = int(height).mul(faceUV.y).add(indY);
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
