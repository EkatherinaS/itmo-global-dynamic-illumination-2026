import {
	Fn,
	If,
	Loop,
	abs,
	array,
	bool,
	ceil,
	distance,
	float,
	floor,
	greaterThan,
	greaterThanEqual,
	instanceIndex,
	int,
	materialColor,
	max,
	min,
	negate,
	normalWorld,
	not,
	output,
	positionLocal,
	positionWorld,
	rand,
	round,
	sqrt,
	storage,
	textureLoad,
	textureStore,
	uint,
	uniform,
	uvec2,
	vec2,
	vec3,
	vec4,
} from "three/tsl";
import {
	DEPTH_CAMERA_BOTTOM,
	DEPTH_CAMERA_LEFT,
	DEPTH_CAMERA_RIGHT,
	DEPTH_CAMERA_TOP,
	DEPTH_HEIGHT,
	DEPTH_WIDTH,
	GRID_HEIGHT,
	GRID_WIDTH,
	PROBE_COUNT,
	SH_COEFFICIENTS_COUNT,
	depthTexture,
	depthTextureTest,
	probePositions,
	sphericalHarmonics,
	visibilityStrength,
	visibleProbes,
} from "./constants";
import { getIrradianceColor } from "./irradiance-texture";

export const probeLightUniform = uniform(false);
export const directLightUniform = uniform(true);
export const irradianceLightUniform = uniform(false);
export const considerAngleUniform = uniform(true);
export const useStreetGridUniform = uniform(true);

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

	const iPairAdd = i.add(1);
	const jPairAdd = j.add(1);
	const iPairSub = i.sub(1);
	const jPairSub = j.sub(1);

	const result = array([
		j.mul(gridWidthUniform).add(i),
		jPairAdd.mul(gridWidthUniform).add(i),
		jPairSub.mul(gridWidthUniform).add(i),

		j.mul(gridWidthUniform).add(iPairAdd),
		jPairAdd.mul(gridWidthUniform).add(iPairAdd),
		jPairSub.mul(gridWidthUniform).add(iPairAdd),

		j.mul(gridWidthUniform).add(iPairSub),
		jPairAdd.mul(gridWidthUniform).add(iPairSub),
		jPairSub.mul(gridWidthUniform).add(iPairSub),
	]);

	If(iPairAdd.equal(gridWidthUniform), () => {
		result.element(3).assign(-1);
		result.element(4).assign(-1);
		result.element(5).assign(-1);
	});

	If(iPairSub.equal(-1), () => {
		result.element(6).assign(-1);
		result.element(7).assign(-1);
		result.element(8).assign(-1);
	});

	If(jPairAdd.equal(gridHeightUniform), () => {
		result.element(1).assign(-1);
		result.element(4).assign(-1);
		result.element(7).assign(-1);
	});

	If(jPairSub.equal(-1), () => {
		result.element(2).assign(-1);
		result.element(5).assign(-1);
		result.element(8).assign(-1);
	});

	return result;
});

const getNeighbouringProbesRegularGrid = Fn(([uv]) => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);

	const i = floor(float(uv.x).div(rangeWidth));
	const j = floor(float(uv.y).div(rangeHeight));

	const iPairAdd = i.add(1);
	const jPairAdd = j.add(1);

	const layerSize = float(probeCountUniform).div(2);

	const result = array([
		j.mul(gridWidthUniform).add(i),
		j.mul(gridWidthUniform).add(i).add(layerSize),

		jPairAdd.mul(gridWidthUniform).add(i),
		jPairAdd.mul(gridWidthUniform).add(i).add(layerSize),

		j.mul(gridWidthUniform).add(iPairAdd),
		j.mul(gridWidthUniform).add(iPairAdd).add(layerSize),

		jPairAdd.mul(gridWidthUniform).add(iPairAdd),
		jPairAdd.mul(gridWidthUniform).add(iPairAdd).add(layerSize),

		int(-1),
	]);

	If(iPairAdd.equal(gridWidthUniform), () => {
		result.element(4).assign(-1);
		result.element(5).assign(-1);
		result.element(6).assign(-1);
		result.element(7).assign(-1);
	});

	If(jPairAdd.equal(gridHeightUniform), () => {
		result.element(2).assign(-1);
		result.element(3).assign(-1);
		result.element(6).assign(-1);
		result.element(7).assign(-1);
	});

	return result;
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

	const visX = float(0);
	const visY = float(0);
	const visZ = float(0);

	If(float(visibleProbeInds.x).notEqual(-1), () => {
		visX.assign(0.5);
	});
	If(float(visibleProbeInds.y).notEqual(-1), () => {
		visY.assign(0.5);
	});
	If(float(visibleProbeInds.z).notEqual(-1), () => {
		visZ.assign(0.5);
	});

	textureStore(
		depthTextureTest,
		uv,
		vec4(
			depth.sub(0.5).add(visX),
			depth.sub(0.5).add(visY),
			depth.sub(0.5).add(visZ),
			// vec3(depth),
			// depth.x
			// 	.sub(1.0)
			// 	.add(float(visibleProbeInds.x).add(0.1).div(probeCountUniform)),
			// depth.y
			// 	.sub(1.0)
			// 	.add(float(visibleProbeInds.y).add(0.1).div(probeCountUniform)),
			// depth.z
			// 	.sub(1.0)
			// 	.add(float(visibleProbeInds.z).add(0.1).div(probeCountUniform)),
			1.0,
		),
	).toReadWrite();
});

const computeVisibilityForUV = Fn(({ uv, probe }) => {
	const uvProbe = getDepthUVFromWorldCoords(probe.xz);
	const dx = int(uv.x).sub(uvProbe.x);
	const dy = int(uv.y).sub(uvProbe.y);

	const steps = uint(max(abs(dx), abs(dy)).sub(1));
	const result = float(1.0);

	Loop(steps, ({ i }) => {
		const t = float(i).div(steps);
		const x = round(uvProbe.x.add(t.mul(dx)));
		const y = round(uvProbe.y.add(t.mul(dy)));
		const depth = float(textureLoad(depthTexture, vec2(x, y)));
		const k = float(4.0);
		If(depth.lessThan(1.0), () => {
			const y0 = result;
			const x0 = sqrt(float(1.0).sub(y0).div(k));
			const x1 = float(0.1).add(x0);
			const y1 = float(1.0).sub(k.mul(x1.mul(x1)));
			result.assign(max(0.0, y1));
		});
	});

	return result;
});

export const computeProbeVisibility = Fn(() => {
	const u = instanceIndex.mod(DEPTH_WIDTH);
	const v = instanceIndex.div(DEPTH_WIDTH);
	const uv = vec2(u, v);
	const pos = getWorldCoordsFromDepthUV(uv);

	let probeInds = array("int", 9).toVar();
	const street = getNeighbouringProbesStreetGrid(uv);
	const regular = getNeighbouringProbesRegularGrid(uv);
	Loop(9, ({ i }) => {
		If(useStreetGridUniform, () => {
			probeInds.element(i).assign(street.element(i));
		}).Else(() => {
			probeInds.element(i).assign(regular.element(i));
		});
	});

	const probesAll = storage(probePositions, "vec4", probeCountUniform);
	const probesVis = storage(visibleProbes, "vec4", DEPTH_HEIGHT * DEPTH_WIDTH);
	const strengthVis = storage(
		visibilityStrength,
		"vec4",
		DEPTH_HEIGHT * DEPTH_WIDTH,
	);
	const results = probeInds;
	const visibility = array([
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(0))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(1))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(2))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(3))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(4))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(5))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(6))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(7))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(8))),
	]);

	Loop(9, ({ i }) => {
		const isVisible = visibility.element(i).notEqual(0.0);
		If(probeInds.element(i).notEqual(-1).and(not(isVisible)), () => {
			results.element(i).assign(-1);
		});
	});

	const d0 = float(1e10);
	const d1 = float(1e10);
	const d2 = float(1e10);
	const d3 = float(1e10);

	const p0 = int(-1);
	const p1 = int(-1);
	const p2 = int(-1);
	const p3 = int(-1);

	Loop(9, ({ i }) => {
		const probe = probesAll.element(probeInds.element(i));
		const x = distance(pos.xy, probe.xz);

		If(results.element(i).notEqual(-1), () => {
			If(x.lessThan(d0), () => {
				d3.assign(d2);
				d2.assign(d1);
				d1.assign(d0);
				d0.assign(x);

				p3.assign(p2);
				p2.assign(p1);
				p1.assign(p0);
				p0.assign(i);
			})
				.ElseIf(x.lessThan(d1), () => {
					d3.assign(d2);
					d2.assign(d1);
					d1.assign(x);

					p3.assign(p2);
					p2.assign(p1);
					p1.assign(i);
				})
				.ElseIf(x.lessThan(d2), () => {
					d3.assign(d2);
					d2.assign(x);

					p3.assign(p2);
					p2.assign(i);
				})
				.ElseIf(x.lessThan(d3), () => {
					d3.assign(x);

					p3.assign(i);
				});
		});
	});

	probesVis.element(instanceIndex).x = results.element(p0);
	probesVis.element(instanceIndex).y = results.element(p1);
	probesVis.element(instanceIndex).z = results.element(p2);
	probesVis.element(instanceIndex).w = results.element(p3);

	strengthVis.element(instanceIndex).x = visibility.element(p0);
	strengthVis.element(instanceIndex).y = visibility.element(p1);
	strengthVis.element(instanceIndex).z = visibility.element(p2);
	strengthVis.element(instanceIndex).w = visibility.element(p3);
});

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

	const uGrid = uint(u.div(rangeWidth));
	const vGrid = uint(v.div(rangeHeight));

	const probeIndex = uint(vGrid.mul(gridWidthUniform).add(uGrid));

	const range = rangeWidth.div(4);
	const allClear = bool(true);

	Loop(range, range, ({ i, j }) => {
		const x = u.add(i).sub(range.div(2));
		const y = v.add(j).sub(range.div(2));
		const depth = float(textureLoad(depthTexture, vec2(x, y)));
		If(depth.lessThan(1.0), () => {
			allClear.assign(false);
		});
	});

	If(allClear, () => {
		const probes = storage(probePositions, "vec4", probeCountUniform);
		const coords = getWorldCoordsFromDepthUV(vec2(u, v));
		probes.element(probeIndex).x = coords.x;
		probes.element(probeIndex).y = 0.3;
		probes.element(probeIndex).z = coords.y;
	});
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
	const strengthVis = storage(
		visibilityStrength,
		"vec4",
		DEPTH_HEIGHT * DEPTH_WIDTH,
	);

	const result = vec4(0);
	const uv = getDepthUVFromWorldCoords(positionWorld.xz);
	const ind = uint(uv.y).mul(DEPTH_WIDTH).add(uv.x);

	const probeInds = array([
		probesVis.element(ind).x,
		probesVis.element(ind).y,
		probesVis.element(ind).z,
		probesVis.element(ind).w,
	]);

	const visCoefs = array([
		strengthVis.element(ind).x,
		strengthVis.element(ind).y,
		strengthVis.element(ind).z,
		strengthVis.element(ind).w,
	]);

	const dir = normalWorld;
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

	const totalInvDist = float(0);
	Loop(4, ({ i }) => {
		const probeInd = probeInds.element(i);
		If(probeInd.notEqual(-1), () => {
			const probe = probesAll.element(probeInd);
			const dist = distance(positionWorld.xz, probe.xz);
			totalInvDist.addAssign(float(1).div(dist));
		});
	});

	Loop(4, SH_COEFFICIENTS_COUNT, ({ i, j }) => {
		const probeInd = probeInds.element(i);
		const coefInd = uint(j);

		const probe = probesAll.element(probeInd);
		const dist = distance(positionWorld.xz, probe.xz);
		const modif = float(1).div(dist).div(totalInvDist);
		const direction = probe.xyz.sub(positionWorld).normalize();
		const dot = float(1.0);

		If(considerAngleUniform, () => {
			dot.assign(min(float(1.5), max(float(0), direction.dot(normalWorld))));
		});

		const shCoeff = vec4(
			shCoeffs.element(probeInd.mul(SH_COEFFICIENTS_COUNT).add(coefInd)),
		);

		If(probeInd.notEqual(-1), () => {
			result.addAssign(
				shCoeff
					.mul(shBasis.element(coefInd))
					.mul(modif)
					.mul(dot)
					.mul(visCoefs.element(i)),
			);
		});
	});

	const dist = max(1.0, distance(positionWorld.xz, vec2(0)).sub(10));
	const distanceModif = max(0.0, float(2.0).sub(dist.mul(dist)));
	return result.mul(distanceModif);
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
