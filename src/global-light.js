import {
	DEPTH_CAMERA_BOTTOM,
	DEPTH_CAMERA_LEFT,
	DEPTH_CAMERA_RIGHT,
	DEPTH_CAMERA_TOP,
	DEPTH_HEIGHT,
	DEPTH_WIDTH,
	HEIGHT,
	GRID_HEIGHT,
	GRID_WIDTH,
	PROBE_COUNT,
	SH_COEFFICIENTS_COUNT,
	WIDTH,
	depthTexture,
	depthTextureTest,
	probePositions,
	sphericalHarmonics,
	visibleProbes,
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
	globalId,
	Break,
	equal,
	int,
	abs,
	round,
	bool,
	normalWorld,
} from "three/tsl";
import { getIrradianceColor } from "./irradiance-texture";
import { normalize } from "three/src/math/MathUtils.js";

export const probeLightUniform = uniform(false);
export const directLightUniform = uniform(true);
export const irradianceLightUniform = uniform(false);

export const probeLightIntensityUniform = uniform(float(1));
export const directLightIntensityUniform = uniform(float(1));
export const irradianceLightIntensityUniform = uniform(float(1));

export const gridWidthUniform = uniform(float(GRID_WIDTH));
export const gridHeightUniform = uniform(float(GRID_HEIGHT));
export const probeCountUniform = uniform(float(PROBE_COUNT));

const getWorldCoordsFromDepthUV = Fn(([uv]) => {
	return vec2(
		float(uv.x)
			.div(DEPTH_WIDTH)
			.mul(DEPTH_CAMERA_RIGHT - DEPTH_CAMERA_LEFT)
			.add(DEPTH_CAMERA_LEFT),
		negate(
			float(uv.y)
				.div(DEPTH_HEIGHT)
				.mul(DEPTH_CAMERA_BOTTOM - DEPTH_CAMERA_TOP)
				.add(DEPTH_CAMERA_TOP),
		),
	);
});

const getDepthUVFromWorldCoords = Fn(([pos]) => {
	const x = max(min(pos.x, DEPTH_CAMERA_RIGHT), DEPTH_CAMERA_LEFT);
	const y = max(min(pos.y, DEPTH_CAMERA_BOTTOM), DEPTH_CAMERA_TOP);

	const width = float(DEPTH_CAMERA_RIGHT).sub(DEPTH_CAMERA_LEFT);
	const height = float(DEPTH_CAMERA_BOTTOM).sub(DEPTH_CAMERA_TOP);

	return vec2(
		x.add(width.div(2)).div(width).mul(DEPTH_WIDTH),
		negate(y).add(height.div(2)).div(height).mul(DEPTH_HEIGHT),
	);
});

const getNeighbouringProbesStreetGrid = Fn(([uv]) => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);

	const i = floor(float(uv.x).div(rangeWidth));
	const j = floor(float(uv.y).div(rangeHeight));

	let iPairAdd = min(gridWidthUniform.sub(1), i.add(1));
	let jPairAdd = min(gridHeightUniform.sub(1), j.add(1));
	let iPairSub = max(0, i.sub(1));
	let jPairSub = max(0, j.sub(1));

	return array([
		j.mul(gridWidthUniform).add(i),
		jPairAdd.mul(gridWidthUniform).add(i),
		jPairSub.mul(gridWidthUniform).add(i),
		j.mul(gridWidthUniform).add(iPairAdd),
		j.mul(gridWidthUniform).add(iPairSub),
		jPairAdd.mul(gridWidthUniform).add(iPairAdd),
		jPairSub.mul(gridWidthUniform).add(iPairAdd),
		jPairAdd.mul(gridWidthUniform).add(iPairSub),
		jPairSub.mul(gridWidthUniform).add(iPairSub),
	]);
});

const getNeighbouringProbesRegularGrid = Fn(([pos]) => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);

	const uv = getDepthUVFromWorldCoords(pos);
	const i = floor(float(uv.x).div(rangeWidth));
	const j = floor(float(uv.y).div(rangeHeight));

	const iPair = i.add(1);
	const jPair = j.add(1);

	const layerSize = float(probeCountUniform).div(2);

	return array([
		j.mul(gridWidthUniform).add(i),
		jPair.mul(gridWidthUniform).add(i),
		j.mul(gridWidthUniform).add(iPair),
		jPair.mul(gridWidthUniform).add(iPair),
		j.mul(gridWidthUniform).add(i).add(layerSize),
		jPair.mul(gridWidthUniform).add(i).add(layerSize),
		j.mul(gridWidthUniform).add(iPair).add(layerSize),
		jPair.mul(gridWidthUniform).add(iPair).add(layerSize),
	]);
});

export const debugDepthMap = Fn(() => {
	const left = instanceIndex.mod(DEPTH_WIDTH);
	const top = instanceIndex.div(DEPTH_WIDTH);

	const uv = vec2(left, top);

	const probesVis = storage(visibleProbes, "vec4", DEPTH_HEIGHT * DEPTH_WIDTH);
	const pos = getWorldCoordsFromDepthUV(uv);
	const depth = float(textureLoad(depthTexture, uv));
	const probeInds = getNeighbouringProbesStreetGrid(uv);
	const visibleProbeInds = probesVis.element(instanceIndex);

	textureStore(
		depthTextureTest,
		uv,
		vec4(
			depth.x
				.sub(0.3)
				.add(float(visibleProbeInds.x).add(0.1).div(probeCountUniform)),
			depth.y
				.sub(0.3)
				.add(float(visibleProbeInds.y).add(0.1).div(probeCountUniform)),
			depth.z
				.sub(0.3)
				.add(float(visibleProbeInds.z).add(0.1).div(probeCountUniform)),
			1.0, //float(visibleProbeInds.element(3)).div(probeCountUniform),
		),
	).toReadWrite();
});

export const computeProbeVisibility = Fn(() => {
	const u = instanceIndex.mod(DEPTH_WIDTH * 4).div(4);
	const v = instanceIndex.div(DEPTH_WIDTH * 4);
	const probeNum = instanceIndex.mod(4);
	const textureInd = instanceIndex.div(4);

	const uv = vec2(u, v);

	const probeInds = getNeighbouringProbesStreetGrid(uv);
	const probesAll = storage(probePositions, "vec4", probeCountUniform);
	const probesVis = storage(visibleProbes, "vec4", DEPTH_HEIGHT * DEPTH_WIDTH);

	const probeInd = probeInds.element(probeNum);
	const probe = vec4(probesAll.element(probeInd));

	const uvProbe = getDepthUVFromWorldCoords(probe.xz);
	const dx = uv.x.sub(uvProbe.x);
	const dy = uv.y.sub(uvProbe.y);

	const steps = uint(max(abs(dx), abs(dy)));

	Loop(steps, ({ i }) => {
		const t = float(i).div(steps);
		const x = round(uvProbe.x.add(t.mul(dx)));
		const y = round(uvProbe.y.add(t.mul(dy)));
		const depth = float(textureLoad(depthTexture, vec2(x, y)));
		If(depth.lessThan(1.0), () => {
			probeInds.element(probeNum).assign(-1);
		});
	});

	If(probeNum.equal(0), () => {
		probesVis.element(textureInd).x = probeInds.element(0);
	});
	If(probeNum.equal(1), () => {
		probesVis.element(textureInd).y = probeInds.element(1);
	});
	If(probeNum.equal(2), () => {
		probesVis.element(textureInd).z = probeInds.element(2);
	});
	If(probeNum.equal(3), () => {
		probesVis.element(textureInd).w = probeInds.element(3);
	});
});

// const computeSingleProbeVisibilityForUV = Fn(({ uv, probeNum }) => {
// 	const probeInds = getNeighbouringProbesStreetGrid(uv);
// 	const probesAll = storage(probePositions, "vec4", probeCountUniform);

// 	const probeInd = probeInds.element(probeNum);
// 	const probe = vec4(probesAll.element(probeInd));
// 	const uvProbe = getDepthUVFromWorldCoords(probe.xz);
// 	const dx = uv.x.sub(uvProbe.x);
// 	const dy = uv.y.sub(uvProbe.y);

// 	const steps = uint(max(abs(dx), abs(dy)));
// 	const result = probeInds.element(probeNum);

// 	Loop(steps, ({ i }) => {
// 		const t = float(i).div(steps);
// 		const x = round(uvProbe.x.add(t.mul(dx)));
// 		const y = round(uvProbe.y.add(t.mul(dy)));
// 		const depth = float(textureLoad(depthTexture, vec2(x, y)));
// 		If(depth.lessThan(1.0), () => {
// 			result.assign(-1);
// 		});
// 	});

// 	return result;
// });

// export const computeProbeVisibility = Fn(() => {
// 	const u = instanceIndex.mod(DEPTH_WIDTH);
// 	const v = instanceIndex.div(DEPTH_WIDTH);
// 	const uv = vec2(u, v);

// 	const probeInds = getNeighbouringProbesStreetGrid(uv);
// 	const probesAll = storage(probePositions, "vec4", probeCountUniform);
// 	const probesVis = storage(visibleProbes, "vec4", DEPTH_HEIGHT * DEPTH_WIDTH);

// 	Loop(9, ({ i }) => {
// 		const result = computeSingleProbeVisibilityForUV(uv, i);

// 		If(result.notEqual(-1), () => {
// 			const pos = getWorldCoordsFromDepthUV(uv);
// 			const probeInd = probeInds.element(i);
// 			const probe = vec4(probesAll.element(probeInd));
// 			const dist = distance(pos.xy, probe.xz);

// 			const probe1 = probesAll.element(probesVis.element(instanceIndex).x);
// 			const probe2 = probesAll.element(probesVis.element(instanceIndex).y);
// 			const probe3 = probesAll.element(probesVis.element(instanceIndex).z);
// 			const probe4 = probesAll.element(probesVis.element(instanceIndex).w);

// 			If(distance(pos.xy, probe1.xz).greaterThan(dist), () => {
// 				const val = probesVis.element(instanceIndex).xyz;
// 				probesVis.element(instanceIndex).yzw = val;
// 				probesVis.element(instanceIndex).x = probeInd;
// 			})
// 				.ElseIf(distance(pos.xy, probe2.xz).greaterThan(dist), () => {
// 					const val = probesVis.element(instanceIndex).yz;
// 					probesVis.element(instanceIndex).zw = val;
// 					probesVis.element(instanceIndex).y = probeInd;
// 				})
// 				.ElseIf(distance(pos.xy, probe3.xz).greaterThan(dist), () => {
// 					const val = probesVis.element(instanceIndex).z;
// 					probesVis.element(instanceIndex).w = val;
// 					probesVis.element(instanceIndex).z = probeInd;
// 				})
// 				.ElseIf(distance(pos.xy, probe4.xz).greaterThan(dist), () => {
// 					probesVis.element(instanceIndex).w = probeInd;
// 				});
// 		});
// 	});
// });

export const debugProbes = Fn(() => {
	If(instanceIndex.lessThan(probeCountUniform), () => {
		const dotWidth = ceil(float(DEPTH_WIDTH).div(64));
		const dotHeight = ceil(float(DEPTH_HEIGHT).div(64));

		const probes = storage(probePositions, "vec4", probeCountUniform);
		const probe = probes.element(instanceIndex);
		const probeUV = getDepthUVFromWorldCoords(probe.xz);

		const startX = probeUV.x.sub(floor(dotWidth.div(2)));
		const startY = probeUV.y.sub(floor(dotHeight.div(2)));

		Loop(dotWidth, dotHeight, ({ i, j }) => {
			textureStore(
				depthTextureTest,
				vec2(startX.add(i), startY.add(j)),
				vec4(1.0, 0.1, 0.4, 1.0),
			).toReadWrite();
		});
	});
});

export const computeStreetGridProbePositions = Fn(() => {
	const u = instanceIndex.mod(DEPTH_WIDTH);
	const v = instanceIndex.div(DEPTH_WIDTH);

	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);

	const uGrid = u.div(rangeWidth);
	const vGrid = v.div(rangeHeight);

	const probeIndex = uint(vGrid.mul(gridWidthUniform).add(uGrid));
	const depth0 = float(textureLoad(depthTexture, vec2(u, v)));
	const depth1 = float(textureLoad(depthTexture, vec2(u.add(1), v)));
	const depth2 = float(textureLoad(depthTexture, vec2(u, v.add(1))));
	const depth3 = float(textureLoad(depthTexture, vec2(u.sub(1), v)));
	const depth4 = float(textureLoad(depthTexture, vec2(u, v.sub(1))));

	If(
		equal(depth0, 1.0)
			.and(equal(depth1, 1.0))
			.and(equal(depth2, 1.0))
			.and(equal(depth3, 1.0))
			.and(equal(depth4, 1.0)),
		() => {
			const probes = storage(probePositions, "vec4", probeCountUniform);
			const coords = getWorldCoordsFromDepthUV(vec2(u, v));
			probes.element(probeIndex).x = coords.x;
			probes.element(probeIndex).y = 0.3;
			probes.element(probeIndex).z = coords.y;
		},
	);
});

export const computeStreetGridProbePositionsBruteForce = Fn(() => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);

	const left = rangeWidth.mul(instanceIndex.mod(gridWidthUniform));
	const top = rangeHeight.mul(instanceIndex.div(gridWidthUniform));

	let gridUV = uvec2(left, top);
	let minDepth = float(0.0);
	let chance = float(0);

	Loop(rangeWidth, rangeHeight, ({ i, j }) => {
		const indX = uint(i).add(rangeWidth.div(2)).mod(rangeWidth);
		const indY = uint(j).add(rangeHeight.div(2)).mod(rangeHeight);
		const uv = vec2(left.add(indX), top.add(indY));
		const depth = float(textureLoad(depthTexture, uv));
		const cur = rand(uv);

		If(greaterThan(depth, minDepth), () => {
			chance.assign(cur);
			gridUV.assign(uv);
			minDepth.assign(depth);
		}).ElseIf(
			greaterThanEqual(depth, minDepth).and(greaterThan(cur, chance)),
			() => {
				chance.assign(cur);
				gridUV.assign(uv);
			},
		);
	});

	If(greaterThan(DEPTH_WIDTH, gridUV.y), () => {
		const probes = storage(probePositions, "vec4", probeCountUniform);
		const coords = getWorldCoordsFromDepthUV(gridUV);
		probes.element(instanceIndex).x = coords.x;
		probes.element(instanceIndex).y = float(1).sub(minDepth).add(1.0);
		probes.element(instanceIndex).z = coords.y;
	});
});

export const computeRegularGridProbePositions = Fn(() => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);

	const levelIndex = instanceIndex.mod(float(probeCountUniform).div(2));
	const left = rangeWidth.mul(levelIndex.mod(gridWidthUniform));
	const top = rangeHeight.mul(levelIndex.div(gridWidthUniform));

	let gridUV = uvec2(left, top);

	const depth = float(textureLoad(depthTexture, gridUV));
	const probes = storage(probePositions, "vec4", probeCountUniform);
	const coords = getWorldCoordsFromDepthUV(gridUV);

	probes.element(instanceIndex).x = coords.x;
	probes.element(instanceIndex).y = ceil(
		float(instanceIndex.add(1)).div(probeCountUniform).mul(2),
	).sub(0.7);
	probes.element(instanceIndex).z = coords.y;
});

export const computeProbeLight = Fn(() => {
	const shCoeffs = storage(
		sphericalHarmonics,
		"vec4",
		probeCountUniform * SH_COEFFICIENTS_COUNT,
	);
	const probesAll = storage(probePositions, "vec4", probeCountUniform);
	const probesVis = storage(visibleProbes, "vec4", DEPTH_HEIGHT * DEPTH_WIDTH);

	const dir = negate(positionLocal.normalize());
	const x = float(dir.x);
	const y = float(dir.y);
	const z = float(dir.z);

	//https://github.com/mrdoob/three.js/blob/dev/src/math/SphericalHarmonics3.js
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
	// CHANGE to switch between probe grids
	const uv = getDepthUVFromWorldCoords(positionWorld.xz);
	const ind = uint(uv.y).mul(DEPTH_WIDTH).add(uv.x);
	const probeInds = array([
		probesVis.element(ind).x,
		probesVis.element(ind).y,
		probesVis.element(ind).z,
		probesVis.element(ind).w,
	]);

	Loop(4, SH_COEFFICIENTS_COUNT, ({ i, j }) => {
		const probeInd = probeInds.element(uint(i));
		const coefInd = uint(j);
		const shCoeff = vec4(
			shCoeffs.element(probeInd.mul(SH_COEFFICIENTS_COUNT).add(coefInd)),
		);

		const probe = vec4(probesAll.element(probeInd));
		// TODO: How to account for distance here?
		const dist = max(distance(positionWorld, probe), 1.0);

		const direction = probe.xyz.sub(positionWorld).normalize();
		const dot = max(float(0.0), direction.dot(normalWorld));

		If(probeInd.greaterThanEqual(0), () => {
			result.addAssign(
				shCoeff.mul(shBasis.element(coefInd)).mul(dot).div(dist).div(dist),
			);
		});
	});

	return result; //vec4(positionWorld.mul(0.01), 1.0);
});

export const computeGlobalLight = Fn(() => {
	const result = vec3(0.0);

	If(directLightUniform, () => {
		result.addAssign(output.mul(directLightIntensityUniform));
	});

	If(irradianceLightUniform, () => {
		const irradiance = getIrradianceColor();
		result.addAssign(
			irradiance.mul(materialColor).mul(irradianceLightIntensityUniform),
		);
	});

	If(probeLightUniform, () => {
		const probe = computeProbeLight();
		result.addAssign(probe.mul(probeLightIntensityUniform));
	});

	return vec4(result, 1.0);
});
