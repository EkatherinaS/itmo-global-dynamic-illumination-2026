import {
	DEPTH_CAMERA_BOTTOM,
	DEPTH_CAMERA_LEFT,
	DEPTH_CAMERA_RIGHT,
	DEPTH_CAMERA_TOP,
	DEPTH_HEIGHT,
	DEPTH_WIDTH,
	HEIGHT,
	SH_COEFFICIENTS_COUNT,
	WIDTH,
	depthTexture,
	depthTextureTest,
	probePositions,
	sphericalHarmonics,
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
} from "three/tsl";
import { getIrradianceColor } from "./irradiance-texture";

export const probeLightUniform = uniform(false);
export const directLightUniform = uniform(true);
export const irradianceLightUniform = uniform(false);

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

const getNeighbouringProbesStreetGrid = Fn(
	([pos, GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
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
	},
);

const getNeighbouringProbesRegularGrid = Fn(
	([pos, GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
		const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
		const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

		const uv = getDepthUVFromWorldCoords(pos);
		const i = floor(float(uv.x).div(rangeWidth));
		const j = floor(float(uv.y).div(rangeHeight));

		const iPair = i.add(1);
		const jPair = j.add(1);

		const layerSize = float(PROBE_COUNT).div(2);

		return array([
			j.mul(GRID_WIDTH).add(i),
			jPair.mul(GRID_WIDTH).add(i),
			j.mul(GRID_WIDTH).add(iPair),
			jPair.mul(GRID_WIDTH).add(iPair),
			j.mul(GRID_WIDTH).add(i).add(layerSize),
			jPair.mul(GRID_WIDTH).add(i).add(layerSize),
			j.mul(GRID_WIDTH).add(iPair).add(layerSize),
			jPair.mul(GRID_WIDTH).add(iPair).add(layerSize),
		]);
	},
);

export const debugDepthMap = Fn(([GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
	const left = instanceIndex.mod(DEPTH_WIDTH);
	const top = instanceIndex.div(DEPTH_WIDTH);

	const uv = vec2(left, top);

	const pos = getWorldCoordsFromDepthUV(uv);
	const depth = float(textureLoad(depthTexture, uv));
	const probeInds = getNeighbouringProbesRegularGrid(
		pos,
		GRID_WIDTH,
		GRID_HEIGHT,
		PROBE_COUNT,
	);

	textureStore(
		depthTextureTest,
		uv,
		vec4(
			vec3(probeInds.element(0).div(PROBE_COUNT)),

			// probeInds.element(7).div(PROBE_COUNT),
			// probeInds.element(7).div(PROBE_COUNT),
			// probeInds.element(7).div(PROBE_COUNT),
			1.0,
		),
	).toReadWrite();
});

export const debugProbes = Fn(([PROBE_COUNT]) => {
	If(instanceIndex.lessThan(PROBE_COUNT), () => {
		const dotWidth = ceil(float(DEPTH_WIDTH).div(64));
		const dotHeight = ceil(float(DEPTH_HEIGHT).div(64));

		const probes = storage(probePositions, "vec4", PROBE_COUNT);
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

export const computeStreetGridProbePositions = Fn(
	([GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
		const u = instanceIndex.mod(DEPTH_WIDTH);
		const v = instanceIndex.div(DEPTH_WIDTH);

		const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
		const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

		const uGrid = u.div(rangeWidth);
		const vGrid = v.div(rangeHeight);

		const probeIndex = uint(vGrid.mul(GRID_WIDTH).add(uGrid));
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
				const probes = storage(probePositions, "vec4", PROBE_COUNT);
				const coords = getWorldCoordsFromDepthUV(vec2(u, v));
				probes.element(probeIndex).x = coords.x;
				probes.element(probeIndex).y = 0.3;
				probes.element(probeIndex).z = coords.y;
			},
		);
	},
);

export const computeStreetGridProbePositionsBruteForce = Fn(
	([GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
		const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
		const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

		const left = rangeWidth.mul(instanceIndex.mod(GRID_WIDTH));
		const top = rangeHeight.mul(instanceIndex.div(GRID_WIDTH));

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
			const probes = storage(probePositions, "vec4", PROBE_COUNT);
			const coords = getWorldCoordsFromDepthUV(gridUV);
			probes.element(instanceIndex).x = coords.x;
			probes.element(instanceIndex).y = float(1).sub(minDepth).add(0.3);
			probes.element(instanceIndex).z = coords.y;
		});
	},
);

export const computeRegularGridProbePositions = Fn(
	([GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
		const rangeWidth = float(DEPTH_WIDTH).div(GRID_WIDTH);
		const rangeHeight = float(DEPTH_HEIGHT).div(GRID_HEIGHT);

		const levelIndex = instanceIndex.mod(float(PROBE_COUNT).div(2));
		const left = rangeWidth.mul(levelIndex.mod(GRID_WIDTH));
		const top = rangeHeight.mul(levelIndex.div(GRID_WIDTH));

		let gridUV = uvec2(left, top);

		const depth = float(textureLoad(depthTexture, gridUV));
		const probes = storage(probePositions, "vec4", PROBE_COUNT);
		const coords = getWorldCoordsFromDepthUV(gridUV);

		probes.element(instanceIndex).x = coords.x;
		probes.element(instanceIndex).y = ceil(
			float(instanceIndex.add(1)).div(PROBE_COUNT).mul(2),
		).sub(0.7);
		probes.element(instanceIndex).z = coords.y;
	},
);

export const computeProbeLight = Fn(
	([GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
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
		const probeInds = getNeighbouringProbesStreetGrid(
			positionWorld.xz,
			GRID_WIDTH,
			GRID_HEIGHT,
			PROBE_COUNT,
		);

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

		return result; //vec4(positionWorld.mul(0.01), 1.0);
	},
);

export const computeGlobalLight = Fn(
	([GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT]) => {
		const result = vec4(vec3(0.0), 1.0);

		If(directLightUniform, () => {
			result.addAssign(output);
		});

		If(irradianceLightUniform, () => {
			const irradiance = getIrradianceColor();
			result.addAssign(irradiance);
		});

		If(probeLightUniform, () => {
			const probe = computeProbeLight(GRID_WIDTH, GRID_HEIGHT, PROBE_COUNT);
			result.addAssign(probe);
		});

		return result;
	},
);
