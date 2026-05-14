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
	LAYER_COUNT,
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
	const height = float(1.0).sub(textureLoad(depthTexture, uv)).add(0.2);

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
		If(layer.greaterThanEqual(layerCountUniform).or(layer.lessThan(2)), () => {
			res.assign(-1);
		});

		result.element(ind).assign(res);
	});

	return result;
});

export const debugDepthMap = Fn(() => {
	const left = instanceIndex.mod(DEPTH_WIDTH);
	const top = instanceIndex.div(DEPTH_WIDTH);

	const uv = vec2(left, top);

	const probesVis = storage(visibleProbes, "vec4", DEPTH_HEIGHT * DEPTH_WIDTH);
	const strengthVis = storage(
		visibilityStrength,
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

	textureStore(
		depthTextureTest,
		uv,
		vec4(
			// depth.sub(0.5).add(visX),
			// depth.sub(0.5).add(visY),
			// depth.sub(0.5).add(visZ),
			// vec3(depth),
			depth.x
				.sub(1.0)
				.add(float(visibleProbeInds.x).add(0.1).div(probeCountUniform)),
			depth.y
				.sub(1.0)
				.add(float(visibleProbeInds.y).add(0.1).div(probeCountUniform)),
			depth.z
				.sub(1.0)
				.add(float(visibleProbeInds.z).add(0.1).div(probeCountUniform)),
			1.0,
		),
	).toReadWrite();
});

const computeVisibilityForUV = Fn(({ pointUV, probe }) => {
	const probeUV = getDepthUVFromWorldCoords(probe.xz);
	const pointDepth = textureLoad(depthTexture, pointUV);

	const probeU = float(probeUV.x);
	const probeV = float(probeUV.y);
	const probeL = float(1.2).sub(probe.y);

	const pointU = float(pointUV.x);
	const pointV = float(pointUV.y);
	const pointL = float(pointDepth);

	const dx = pointU.sub(probeU);
	const dy = pointV.sub(probeV);
	const dl = pointL.sub(probeL);

	const steps = uint(max(abs(dx), abs(dy), abs(dl)).sub(1));
	const result = float(1.0);
	const k = float(1.0);

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
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(9))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(10))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(11))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(12))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(13))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(14))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(15))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(16))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(17))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(18))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(19))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(20))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(21))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(22))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(23))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(24))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(25))),
		computeVisibilityForUV(uv, probesAll.element(probeInds.element(26))),
	]);

	Loop(27, ({ i }) => {
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
	const rangeWidth = float(DEPTH_WIDTH).div(gridWidthUniform);
	const rangeHeight = float(DEPTH_HEIGHT).div(gridHeightUniform);
	const layerCount = float(DEPTH_WIDTH).mul(DEPTH_HEIGHT);
	const layerProbeCount = gridWidthUniform.mul(gridHeightUniform);

	const u = instanceIndex.mod(layerCount).mod(DEPTH_WIDTH);
	const v = instanceIndex.mod(layerCount).div(DEPTH_WIDTH);
	const layer = instanceIndex.div(layerCount);

	const uGrid = uint(u.div(rangeWidth));
	const vGrid = uint(v.div(rangeHeight));
	const randValue = rand(vec2(u.mul(layer), v.mul(layer)));

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

	If(allClear.and(randValue.greaterThan(0.7)), () => {
		const probes = storage(probePositions, "vec4", probeCountUniform);
		const coords = getWorldCoordsFromDepthUV(vec2(u, v));
		probes.element(probeIndex).x = coords.x;
		probes.element(probeIndex).y = float(1.0).sub(layerDepth).add(0.2);
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

	probes.element(instanceIndex).x = coords.x;
	probes.element(instanceIndex).y = float(layer).mul(0.5).add(0.2);
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
