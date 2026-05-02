import {
	DEPTH_CAMERA_BOTTOM,
	DEPTH_CAMERA_LEFT,
	DEPTH_CAMERA_RIGHT,
	DEPTH_CAMERA_TOP,
	DEPTH_HEIGHT,
	DEPTH_WIDTH,
	depthTexture,
	depthTextureTest,
	GRID_HEIGHT,
	GRID_WIDTH,
	HEIGHT,
	PROBE_COUNT,
	probePositions,
	SH_COEFFICIENTS_COUNT,
	sphericalHarmonics,
	WIDTH,
} from "./constants";
import {
	div,
	mod,
	storage,
	uint,
	uniform,
	vec3,
	Fn,
	instanceIndex,
	positionLocal,
	vec4,
	float,
	materialColor,
	negate,
	positionWorld,
	distance,
	color,
	output,
	Loop,
	max,
	array,
	rand,
	vec2,
	textureStore,
	textureLoad,
	If,
	uvec2,
	min,
	depth,
	greaterThanEqual,
	greaterThan,
	ceil,
	floor,
	lessThan,
	lessThanEqual,
} from "three/tsl";

const getWorldCoordsFromDepthUV = Fn(([uv]) => {
	return vec2(
		float(uv.x)
			.div(DEPTH_WIDTH)
			.mul(DEPTH_CAMERA_RIGHT - DEPTH_CAMERA_LEFT)
			.add(DEPTH_CAMERA_LEFT),
		float(uv.y)
			.div(DEPTH_HEIGHT)
			.mul(DEPTH_CAMERA_BOTTOM - DEPTH_CAMERA_TOP)
			.add(DEPTH_CAMERA_TOP),
	);
});

const getDepthUVFromWorldCoords = Fn(([pos]) => {
	const x = max(min(pos.x, DEPTH_CAMERA_RIGHT), DEPTH_CAMERA_LEFT);
	const y = max(min(pos.y, DEPTH_CAMERA_BOTTOM), DEPTH_CAMERA_TOP);

	const width = float(DEPTH_CAMERA_RIGHT).sub(DEPTH_CAMERA_LEFT);
	const height = float(DEPTH_CAMERA_BOTTOM).sub(DEPTH_CAMERA_TOP);

	return vec2(
		x.add(width.div(2)).div(width).mul(DEPTH_WIDTH),
		y.add(height.div(2)).div(height).mul(DEPTH_HEIGHT),
	);
});

const getCoordsForProbe = Fn(([ind]) => {
	const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
	const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

	const left = rangeWidth.mul(instanceIndex.mod(GRID_WIDTH));
	const top = rangeHeight.mul(instanceIndex.div(GRID_WIDTH));
	const right = left + rangeWidth;
	const bottom = top + rangeHeight;

	return vec4(left, right, top, bottom);
});

const getNeighbouringProbesIndForPosition = Fn(([pos]) => {
	const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
	const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

	const uv = getDepthUVFromWorldCoords(pos);
	const i = floor(float(uv.x).div(rangeWidth));
	const j = floor(float(uv.y).div(rangeHeight));

	let iPair = float(0);
	let jPair = float(0);

	If(lessThan(uv.x.mod(rangeWidth), rangeWidth.div(2)), () => {
		iPair.assign(max(0, i.sub(1)));
	}).Else(() => {
		iPair.assign(min(GRID_WIDTH, i.add(1)));
	});

	If(lessThanEqual(uv.y.mod(rangeHeight), rangeHeight.div(2)), () => {
		jPair.assign(max(0, j.sub(1)));
	}).Else(() => {
		jPair.assign(min(GRID_HEIGHT, j.add(1)));
	});

	return array([
		j.mul(GRID_WIDTH).add(i),
		jPair.mul(GRID_WIDTH).add(i),
		j.mul(GRID_WIDTH).add(iPair),
		jPair.mul(GRID_WIDTH).add(iPair),
	]);
});

export const computeProbePositions = Fn(() => {
	const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
	const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

	const left = rangeWidth.mul(instanceIndex.mod(GRID_WIDTH));
	const top = rangeHeight.mul(instanceIndex.div(GRID_WIDTH));

	let probeUV = uvec2(left, top);
	let minDepth = float(0.0);
	let chance = float(0);

	Loop(rangeWidth, rangeHeight, ({ i, j }) => {
		const indX = uint(i).add(rangeWidth.div(2)).mod(rangeWidth);
		const indY = uint(j).add(rangeHeight.div(2)).mod(rangeHeight);
		const uv = vec2(left.add(indX), top.add(indY));
		const depth = float(textureLoad(depthTexture, uv));
		const cur = rand(uv);

		const pos = getWorldCoordsFromDepthUV(uv);
		const probeInds = getNeighbouringProbesIndForPosition(pos);

		textureStore(depthTextureTest, uv, vec4(vec3(depth), 1.0)).toReadWrite();

		If(greaterThan(depth, minDepth), () => {
			chance.assign(cur);
			probeUV.assign(uv);
			minDepth.assign(depth);
		}).ElseIf(
			greaterThanEqual(depth, minDepth).and(greaterThan(cur, chance)),
			() => {
				chance.assign(cur);
				probeUV.assign(uv);
			},
		);
	});

	If(greaterThan(DEPTH_WIDTH, probeUV.y), () => {
		const probes = storage(probePositions, "vec4", PROBE_COUNT);
		const coords = getWorldCoordsFromDepthUV(probeUV);
		probes.element(instanceIndex).x = coords.x;
		probes.element(instanceIndex).y = minDepth;
		probes.element(instanceIndex).z = coords.y;

		textureStore(
			depthTextureTest,
			vec2(probeUV.x, probeUV.y),
			vec4(1.0, 0.1, 0.4, 1.0),
		).toReadWrite();
	});
});

export const computeGlobalLight = Fn(() => {
	const shCoeffs = storage(
		sphericalHarmonics,
		"vec4",
		PROBE_COUNT * SH_COEFFICIENTS_COUNT,
	);
	const probes = storage(probePositions, "vec4", PROBE_COUNT);

	const dir = negate(positionLocal.normalize());
	const x = float(dir.x);
	const y = float(dir.y);
	const z = float(dir.z);

	const shBasis = array([
		float(0.282095),
		float(0.488603).mul(y),
		float(0.488603).mul(z),
		float(0.488603).mul(x),
		float(1.092548).mul(x).mul(y),
		float(1.092548).mul(y).mul(z),
		float(0.315392).mul(float(3).mul(z).mul(z).sub(1)),
		float(1.092548).mul(x).mul(z),
		float(0.546274).mul(x.mul(x).sub(y.mul(y))),
	]);

	const result = vec4(0);
	const probeInds = getNeighbouringProbesIndForPosition(positionWorld.xz);

	Loop(4, SH_COEFFICIENTS_COUNT, ({ i, j }) => {
		const probeInd = probeInds.element(uint(i));
		const coefInd = uint(j);
		const shCoeff = vec4(
			shCoeffs.element(probeInd.mul(SH_COEFFICIENTS_COUNT).add(coefInd)),
		);
		const probe = vec4(probes.element(probeInd));
		const dist = max(
			float(1).div(distance(positionWorld, probe)).mul(0.1),
			0.000001,
		);
		result.addAssign(shCoeff.mul(shBasis.element(coefInd)).mul(dist));
	});

	return output.add(result); //vec4(positionWorld.mul(0.01), 1.0);
});
