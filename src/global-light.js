import {
	Fn,
	If,
	Loop,
	abs,
	array,
	bool,
	ceil,
	clamp,
	distance,
	float,
	floor,
	instanceIndex,
	int,
	materialColor,
	max,
	min,
	negate,
	normalWorld,
	output,
	positionWorld,
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
	BLUR_PROBE_COEF,
	CONSIDER_ANGLE,
	DEPTH_CAMERA_BOTTOM,
	DEPTH_CAMERA_LEFT,
	DEPTH_CAMERA_RIGHT,
	DEPTH_CAMERA_TOP,
	DEPTH_HEIGHT,
	DEPTH_WIDTH,
	DIRECT_INTENSITY,
	ENTER_SHADOW_AREA,
	GRID_HEIGHT,
	GRID_WIDTH,
	INTERPOLATE,
	IRRAIDANCE_INTENSITY,
	LAYER_COUNT,
	PROBE_COUNT,
	PROBE_GRID_TYPE,
	PROBE_INTENSITY,
	SHADOW_AREA_BLUR,
	SH_COEFFICIENTS_COUNT,
	blurTexture,
	depthTexture,
	depthTextureTest,
	probePositions,
	probeVisibility,
	probeVisibilityCoeffs,
	sphericalHarmonics,
} from "./constants";
import { getIrradianceColor } from "./irradiance-texture";

export const considerAngleUniform = uniform(CONSIDER_ANGLE);
export const interpolatedUniform = uniform(INTERPOLATE);
export const useStreetGridUniform = uniform(PROBE_GRID_TYPE == "street");

export const probeLightIntensityUniform = uniform(float(PROBE_INTENSITY));
export const directLightIntensityUniform = uniform(float(DIRECT_INTENSITY));
export const irradianceLightIntensityUniform = uniform(
	float(IRRAIDANCE_INTENSITY),
);

export const blurProbeCoeffsUniform = float(BLUR_PROBE_COEF);
export const enterShadowAreaUniform = float(ENTER_SHADOW_AREA);
export const shadowAreaBlurUniform = float(SHADOW_AREA_BLUR);

export const gridWidthUniform = uniform(float(GRID_WIDTH));
export const gridHeightUniform = uniform(float(GRID_HEIGHT));
export const probeCountUniform = uniform(float(PROBE_COUNT));
export const layerCountUniform = uniform(float(LAYER_COUNT));

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

const getNeighbouringProbes = Fn(([uv]) => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);
	const rangeLayer = float(1.0).div(layerCountUniform);
	const layerProbeCount = gridWidthUniform.mul(gridHeightUniform);
	const height = float(1.0).sub(textureLoad(depthTexture, uv));

	const gridX = floor(float(uv.x).div(rangeWidth));
	const gridY = floor(float(uv.y).div(rangeHeight));
	const gridL = floor(height.div(rangeLayer));

	let result = array("int", 27).toVar();

	Loop(3, 3, 3, ({ i, j, k }) => {
		const col = gridX.add(int(i).sub(1));
		const row = gridY.add(int(j).sub(1));
		const layer = gridL.add(int(k).sub(1));
		const ind = int(i).mul(9).add(j.mul(3)).add(k);

		const res = float(
			row.mul(gridWidthUniform).add(col).add(layerProbeCount.mul(layer)),
		);

		If(col.greaterThanEqual(gridWidthUniform).or(col.lessThan(0)), () => {
			res.assign(-1);
		});
		If(row.greaterThanEqual(gridHeightUniform).or(row.lessThan(0)), () => {
			res.assign(-1);
		});
		If(layer.greaterThanEqual(layerCountUniform).or(layer.lessThan(0)), () => {
			res.assign(-1);
		});

		result.element(ind).assign(res);
	});

	return result;
});

const getNeighbouringProbesCube = Fn(([pos]) => {
	const width = float(DEPTH_CAMERA_RIGHT).sub(DEPTH_CAMERA_LEFT);
	const height = float(DEPTH_CAMERA_BOTTOM).sub(DEPTH_CAMERA_TOP);

	const rangeWidth = width.div(gridWidthUniform);
	const rangeHeight = height.div(gridHeightUniform);
	const rangeLayer = float(1.0).div(layerCountUniform);
	const layerProbeCount = gridWidthUniform.mul(gridHeightUniform);

	const gridX = floor(float(pos.x).add(width.div(2)).div(rangeWidth));
	const gridY = floor(negate(float(pos.z)).add(height.div(2)).div(rangeHeight));
	const gridL = floor(float(pos.y).div(rangeLayer));

	let result = array("int", 8).toVar();

	Loop(2, 2, 2, ({ i, j, k }) => {
		const col = gridX.add(int(i).sub(1));
		const row = gridY.add(int(j).sub(1));
		const layer = gridL.add(int(k));
		const ind = int(i).mul(4).add(j.mul(2)).add(k);

		const res = float(
			row.mul(gridWidthUniform).add(col).add(layerProbeCount.mul(layer)),
		);

		If(col.greaterThanEqual(gridWidthUniform).or(col.lessThan(0)), () => {
			res.assign(-1);
		});
		If(row.greaterThanEqual(gridHeightUniform).or(row.lessThan(0)), () => {
			res.assign(-1);
		});
		If(layer.greaterThanEqual(layerCountUniform).or(layer.lessThan(0)), () => {
			res.assign(-1);
		});

		result.element(ind).assign(res);
	});

	return result;
});

const getNeighbouringProbesSquare = Fn(([pos]) => {
	const probesAll = storage(probePositions, "vec4", probeCountUniform);

	const width = float(DEPTH_CAMERA_RIGHT).sub(DEPTH_CAMERA_LEFT);
	const height = float(DEPTH_CAMERA_BOTTOM).sub(DEPTH_CAMERA_TOP);

	const rangeWidth = width.div(gridWidthUniform);
	const rangeHeight = height.div(gridHeightUniform);

	const gridX = floor(float(pos.x).add(width.div(2)).div(rangeWidth));
	const gridY = floor(negate(float(pos.z)).add(height.div(2)).div(rangeHeight));
	const ind = gridY.mul(gridWidthUniform).add(gridX);

	const pairX = min(gridWidthUniform.sub(1), gridX.add(1));
	const pairY = min(gridHeightUniform.sub(1), gridY.add(1));

	const result = array([
		gridY.mul(gridWidthUniform).add(gridX),
		gridY.mul(gridWidthUniform).add(pairX),
		pairY.mul(gridWidthUniform).add(pairX),
		pairY.mul(gridWidthUniform).add(gridX),
	]);

	return result;
});

export const debugDepthMap = Fn(() => {
	const left = instanceIndex.mod(DEPTH_WIDTH);
	const top = instanceIndex.div(DEPTH_WIDTH);

	const uv = vec2(left, top);

	const probesVis = storage(
		probeVisibility,
		"vec4",
		DEPTH_HEIGHT * DEPTH_WIDTH,
	);
	const strengthVis = storage(
		probeVisibilityCoeffs,
		"vec4",
		DEPTH_HEIGHT * DEPTH_WIDTH,
	);

	const pos = getWorldCoordsFromDepthUV(uv);
	const depth = float(textureLoad(depthTexture, uv));
	const probeInds = getNeighbouringProbes(uv);
	const visibleProbeInds = probesVis.element(instanceIndex);

	const visX = float(0);
	const visY = float(0);
	const visZ = float(0);

	If(float(visibleProbeInds.x).notEqual(0), () => {
		visX.assign(0.5);
	});
	If(float(visibleProbeInds.y).notEqual(0), () => {
		visY.assign(0.5);
	});
	If(float(visibleProbeInds.z).notEqual(0), () => {
		visZ.assign(0.5);
	});

	const width = float(DEPTH_CAMERA_RIGHT).sub(DEPTH_CAMERA_LEFT);
	const height = float(DEPTH_CAMERA_BOTTOM).sub(DEPTH_CAMERA_TOP);

	const rangeWidth = width.div(gridWidthUniform);
	const rangeHeight = height.div(gridHeightUniform);

	const gridX = floor(float(pos.x).add(width.div(2)).div(rangeWidth));
	const gridY = floor(negate(float(pos.y)).add(height.div(2)).div(rangeHeight));

	const ind = gridY.mul(gridWidthUniform).add(gridX);

	const res = getNeighbouringProbesSquare(vec3(pos.x, 0, pos.y));

	textureStore(
		depthTextureTest,
		uv,
		vec4(
			vec3(depth),
			// depth.sub(0.5).add(visX),
			// depth.sub(0.5).add(visY),
			// depth.sub(0.5).add(visZ),
			// depth.x.sub(1.0).add(res.element(1).div(probeCountUniform)),
			// depth.y.sub(1.0).add(res.element(2).div(probeCountUniform)),
			// depth.z.sub(1.0).add(res.element(3).div(probeCountUniform)),
			1.0,
		),
	);
});

const computeVisibilityForUV = Fn(({ pointUV, probe }) => {
	const probeUV = getDepthUVFromWorldCoords(probe.xz);
	const pointDepth = textureLoad(depthTexture, pointUV);

	const probeU = float(probeUV.x);
	const probeV = float(probeUV.y);
	const probeL = float(1).sub(probe.y);

	const pointU = float(pointUV.x);
	const pointV = float(pointUV.y);
	const pointL = float(pointDepth);

	const dx = pointU.sub(probeU);
	const dy = pointV.sub(probeV);
	const dl = pointL.sub(probeL);

	const steps = uint(max(abs(dx), abs(dy))).sub(enterShadowAreaUniform);
	const result = float(1.0);
	const k = float(shadowAreaBlurUniform);

	Loop(steps, ({ i }) => {
		const t = float(i).div(steps);
		const u = round(probeU.add(t.mul(dx)));
		const v = round(probeV.add(t.mul(dy)));
		const l = probeL.add(t.mul(dl));

		const depth = float(textureLoad(depthTexture, vec2(u, v)));

		If(depth.lessThan(l), () => {
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
	const probeInds = getNeighbouringProbes(uv);

	const probesAll = storage(probePositions, "vec4", probeCountUniform);
	const probesVis = storage(
		probeVisibility,
		"vec4",
		DEPTH_HEIGHT * DEPTH_WIDTH,
	);

	const results = probeInds;
	let visibility = array("float", 27).toVar();

	Loop(27, ({ i }) => {
		If(probeInds.element(i).notEqual(-1), () => {
			const res = computeVisibilityForUV(
				uv,
				probesAll.element(probeInds.element(i)),
			);
			visibility.element(i).assign(res);
			If(res.equal(0.0), () => {
				results.element(i).assign(-1);
			});
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

	Loop(27, ({ i }) => {
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

	textureStore(
		probeVisibilityCoeffs,
		vec2(u, v),
		vec4(
			visibility.element(p0),
			visibility.element(p1),
			visibility.element(p2),
			visibility.element(p3),
		),
	);
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
			);
		});
	});
});

export const computeStreetGridProbePositions = Fn(() => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);
	const layerCount = float(DEPTH_WIDTH).mul(DEPTH_HEIGHT);
	const layerProbeCount = gridWidthUniform.mul(gridHeightUniform);

	const u = instanceIndex.mod(layerCount).mod(DEPTH_WIDTH);
	const v = instanceIndex.mod(layerCount).div(DEPTH_WIDTH);
	const layer = instanceIndex.div(layerCount);

	const uGrid = uint(u.div(rangeWidth));
	const vGrid = uint(v.div(rangeHeight));
	const probeIndex = uint(
		vGrid.mul(gridWidthUniform).add(uGrid).add(layerProbeCount.mul(layer)),
	);

	const range = rangeWidth.div(4);
	const allClear = bool(true);
	const layerDepth = float(layerCountUniform.sub(layer)).div(layerCountUniform);

	Loop(range, range, ({ i, j }) => {
		const x = u.add(i).sub(range.div(2));
		const y = v.add(j).sub(range.div(2));
		const depth = float(textureLoad(depthTexture, vec2(x, y)));
		If(depth.lessThan(layerDepth), () => {
			allClear.assign(false);
		});
	});

	const layerHeight = float(1).div(layerCountUniform);
	const curLayerHeight = layerHeight.mul(layer).add(layerHeight.div(2));

	If(allClear, () => {
		const probes = storage(probePositions, "vec4", probeCountUniform);
		const coords = getWorldCoordsFromDepthUV(vec2(u, v));
		probes.element(probeIndex).x = coords.x;
		probes.element(probeIndex).y = curLayerHeight;
		probes.element(probeIndex).z = coords.y;
	});
});

export const computeRegularGridProbePositions = Fn(() => {
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);
	const layerProbeCount = gridWidthUniform.mul(gridHeightUniform);
	const probes = storage(probePositions, "vec4", probeCountUniform);

	const layer = instanceIndex.div(layerProbeCount);
	const layerIndex = instanceIndex.mod(layerProbeCount);
	const u = rangeWidth.mul(layerIndex.mod(gridWidthUniform));
	const v = rangeHeight.mul(layerIndex.div(gridWidthUniform));

	const gridUV = uvec2(u, v);
	const depth = float(textureLoad(depthTexture, gridUV));
	const coords = getWorldCoordsFromDepthUV(gridUV);

	const layerHeight = float(1).div(layerCountUniform);
	const curLayerHeight = layerHeight.mul(layer).add(layerHeight.div(2));

	probes.element(instanceIndex).x = coords.x;
	probes.element(instanceIndex).y = curLayerHeight;
	probes.element(instanceIndex).z = coords.y;
});

export const horizontalBlurShader = Fn(() => {
	const u = instanceIndex.mod(DEPTH_WIDTH);
	const v = instanceIndex.div(DEPTH_WIDTH);

	const sum = vec4(0);
	const rad = int(blurProbeCoeffsUniform);
	const diameter = rad.mul(2).add(1);

	Loop(diameter, ({ i }) => {
		const offset = i.sub(rad);
		const sampleU = u.add(offset);
		const inBounds = sampleU
			.greaterThanEqual(0)
			.and(sampleU.lessThan(DEPTH_WIDTH));

		const sampleCoord = vec2(sampleU, v);
		const sample = textureLoad(probeVisibilityCoeffs, sampleCoord);
		sum.addAssign(sample.mul(inBounds));
	});

	const samplesCount = float(diameter);
	const result = sum.div(samplesCount);

	textureStore(blurTexture, vec2(u, v), result);
});

export const verticalBlurShader = Fn(() => {
	const u = instanceIndex.mod(DEPTH_WIDTH);
	const v = instanceIndex.div(DEPTH_WIDTH);

	const sum = vec4(0);
	const rad = int(blurProbeCoeffsUniform);
	const diameter = rad.mul(2).add(1);

	Loop(diameter, ({ i }) => {
		const offset = i.sub(rad);
		const sampleV = v.add(offset);
		const inBounds = sampleV
			.greaterThanEqual(0)
			.and(sampleV.lessThan(DEPTH_HEIGHT));

		const sampleCoord = vec2(u, sampleV);
		const sample = textureLoad(blurTexture, sampleCoord);
		sum.addAssign(sample.mul(inBounds));
	});

	const result = sum.div(float(diameter));
	textureStore(probeVisibilityCoeffs, vec2(u, v), result);
});

const getBarycentricWeights = Fn(([probeInds]) => {
	const probesAll = storage(probePositions, "vec4", probeCountUniform);
	const weights = array([float(1), float(0), float(0), float(0)]).toVar();

	If(probeInds.element(2).notEqual(-1), () => {
		const p0 = probesAll.element(probeInds.element(0)).xz;
		const p1 = probesAll.element(probeInds.element(1)).xz;
		const p2 = probesAll.element(probeInds.element(2)).xz;
		const p = positionWorld.xz;

		const s0 = abs(
			p.x
				.mul(p1.y.sub(p2.y))
				.add(p1.x.mul(p2.y.sub(p.y)))
				.add(p2.x.mul(p.y.sub(p1.y))),
		);
		const s1 = abs(
			p0.x
				.mul(p.y.sub(p2.y))
				.add(p.x.mul(p2.y.sub(p0.y)))
				.add(p2.x.mul(p0.y.sub(p.y))),
		);
		const s2 = abs(
			p0.x
				.mul(p1.y.sub(p.y))
				.add(p1.x.mul(p.y.sub(p0.y)))
				.add(p.x.mul(p0.y.sub(p1.y))),
		);
		const s = s0.add(s1).add(s2);

		weights.element(0).assign(s0.div(s));
		weights.element(1).assign(s1.div(s));
		weights.element(2).assign(s2.div(s));
	}).ElseIf(probeInds.element(1).notEqual(-1), () => {
		const p0 = probesAll.element(probeInds.element(0));
		const p1 = probesAll.element(probeInds.element(1));

		const dist0 = float(1).div(distance(positionWorld.xz, p0.xz));
		const dist1 = float(1).div(distance(positionWorld.xz, p1.xz));

		const sumInv = dist0.add(dist1);
		weights.element(0).assign(dist0.div(sumInv));
		weights.element(1).assign(dist1.div(sumInv));
	});

	return weights;
});

export const computeProbeLight = Fn(() => {
	const dist = max(1.0, distance(positionWorld.xz, vec2(0)).sub(10.5));
	const distanceModif = max(0.0, float(2.0).sub(dist.mul(dist)));
	const result = vec4(0);

	If(distanceModif.greaterThan(0), () => {
		const shCoeffs = storage(
			sphericalHarmonics,
			"vec4",
			probeCountUniform * SH_COEFFICIENTS_COUNT,
		);
		const probesVis = storage(
			probeVisibility,
			"vec4",
			DEPTH_HEIGHT * DEPTH_WIDTH,
		);

		const uv = getDepthUVFromWorldCoords(positionWorld.xz);
		const ind = uint(uv.y).mul(DEPTH_WIDTH).add(uv.x);
		const strengthVis = textureLoad(probeVisibilityCoeffs, uv);

		const probeInds = array([
			probesVis.element(ind).x,
			probesVis.element(ind).y,
			probesVis.element(ind).z,
			probesVis.element(ind).w,
		]);
		const visCoefs = array([
			strengthVis.x,
			strengthVis.y,
			strengthVis.z,
			strengthVis.w,
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

		const probesAll = storage(probePositions, "vec4", probeCountUniform);
		const probes = array([
			probesAll.element(max(0, probeInds.element(0))),
			probesAll.element(max(0, probeInds.element(1))),
			probesAll.element(max(0, probeInds.element(2))),
			probesAll.element(max(0, probeInds.element(3))),
		]);

		const totalInvDist = float(0);
		Loop(4, ({ i }) => {
			const probeInd = probeInds.element(i);
			If(probeInd.notEqual(-1), () => {
				const dist = distance(positionWorld.xz, probes.element(i).xz);
				totalInvDist.addAssign(float(1).div(dist));
			});
		});

		const modifs = array([float(1), float(0), float(0), float(0)]).toVar();
		Loop(4, ({ i }) => {
			const probeInd = probeInds.element(i);
			If(probeInd.notEqual(-1), () => {
				const dist = distance(positionWorld.xz, probes.element(i).xz);
				modifs.element(i).assign(float(1).div(dist).div(totalInvDist));
			});
		});

		Loop(4, SH_COEFFICIENTS_COUNT, ({ i, j }) => {
			const probeInd = probeInds.element(i);
			const shCoeff = vec4(
				shCoeffs.element(probeInd.mul(SH_COEFFICIENTS_COUNT).add(j)),
			);

			const direction = probes.element(i).xyz.sub(positionWorld).normalize();
			const dot = float(1.0);

			If(considerAngleUniform, () => {
				dot.assign(direction.dot(normalWorld));
			});

			If(probeInd.notEqual(-1), () => {
				result.addAssign(
					shCoeff
						.mul(shBasis.element(j))
						.mul(visCoefs.element(i))
						.mul(modifs.element(i))
						.mul(dot),
				);
			});
		});
	});

	return result.mul(distanceModif);
});

const bicubicWeights = Fn(([Q00, Q10, Q11, Q01, P]) => {
	const u = float(P.x.sub(Q00.x)).div(Q10.x.sub(Q00.x));
	const v = float(P.y.sub(Q00.y)).div(Q01.y.sub(Q00.y));

	u.assign(clamp(u, 0.0, 1.0));
	v.assign(clamp(v, 0.0, 1.0));

	const U = float(3).mul(u).mul(u).sub(float(2).mul(u).mul(u).mul(u));
	const V = float(3).mul(v).mul(v).sub(float(2).mul(v).mul(v).mul(v));

	const w00 = float(1).sub(U).mul(float(1).sub(V));
	const w10 = U.mul(float(1).sub(V));
	const w11 = U.mul(V);
	const w01 = float(1).sub(U).mul(V);

	return array([w00, w10, w11, w01]);
});

export const computeInterpolatedProbeLight = Fn(() => {
	const shCoeffs = storage(
		sphericalHarmonics,
		"vec4",
		probeCountUniform * SH_COEFFICIENTS_COUNT,
	);
	const probesAll = storage(probePositions, "vec4", probeCountUniform);

	const result = vec4(0);
	const probeInds = getNeighbouringProbesSquare(positionWorld);

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

	const weights = bicubicWeights(
		probesAll.element(probeInds.element(0)).xz,
		probesAll.element(probeInds.element(1)).xz,
		probesAll.element(probeInds.element(2)).xz,
		probesAll.element(probeInds.element(3)).xz,
		positionWorld.xz,
	);

	Loop(4, SH_COEFFICIENTS_COUNT, ({ i, j }) => {
		const probeInd = probeInds.element(i);
		const coefInd = uint(j);
		const modif = weights.element(i);

		const shCoeff = vec4(
			shCoeffs.element(probeInd.mul(SH_COEFFICIENTS_COUNT).add(coefInd)),
		);

		If(probeInd.notEqual(-1), () => {
			result.addAssign(shCoeff.mul(shBasis.element(coefInd)).mul(modif));
		});
	});

	const dist = max(1.0, distance(positionWorld.xz, vec2(0)).sub(10));
	const distanceModif = max(0.0, float(5.0).sub(dist.mul(dist)));
	return result.mul(distanceModif);
});

export const computeGlobalLight = Fn(() => {
	const result = vec3(0.0);

	result.addAssign(output.mul(directLightIntensityUniform));

	const irradiance = getIrradianceColor();
	result.addAssign(
		irradiance.mul(materialColor).mul(irradianceLightIntensityUniform),
	);
	const probe = computeProbeLight();
	result.addAssign(probe.mul(probeLightIntensityUniform));
	return vec4(result, 1.0);
});
