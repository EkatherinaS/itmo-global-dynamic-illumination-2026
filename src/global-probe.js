import {
	Fn,
	If,
	Loop,
	PI,
	Switch,
	array,
	bool,
	color,
	convertColorSpace,
	float,
	floor,
	instanceIndex,
	int,
	min,
	negate,
	storage,
	textureLoad,
	uint,
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
	depthTexture,
	PROBE_RENDER_TARGET_SIZE,
	probeCameraTarget,
	probePositions,
	SH_COEFFICIENTS_COUNT,
	sphericalHarmonics,
} from "./constants";
import {
	getWorldCoordsFromDepthUV,
	gridHeightUniform,
	gridWidthUniform,
	layerCountUniform,
	probeCountUniform,
} from "./global-helpers";
import { LinearSRGBColorSpace, SRGBColorSpace } from "three/webgpu";

export const getNeighbouringProbes = Fn(([uv]) => {
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

export const getNeighbouringProbesCube = Fn(([pos]) => {
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

export const getNeighbouringProbesSquare = Fn(([pos]) => {
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
	const probeInd = uint(
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
		probes.element(probeInd).x = coords.x;
		probes.element(probeInd).y = curLayerHeight;
		probes.element(probeInd).z = coords.y;
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

export const computeProbeCoeffs = Fn(() => {
	const probeInd = float(instanceIndex);
	const shCount = probeCountUniform.mul(SH_COEFFICIENTS_COUNT);
	const rtWidth = float(PROBE_RENDER_TARGET_SIZE);
	const faceSize = rtWidth.mul(rtWidth);

	const rtStorage = storage(probeCameraTarget, "vec4", probeCountUniform);
	const shStorage = storage(sphericalHarmonics, "vec4", shCount);

	const totalWeight = float(0);
	const coord = vec3(0);
	const flip = float(1);
	const shCoefficients = array([
		vec3(0),
		vec3(0),
		vec3(0),
		vec3(0),
		vec3(0),
		vec3(0),
		vec3(0),
		vec3(0),
		vec3(0),
	]).toVar();

	Loop(6, faceSize, ({ i: faceIndex, j: localIndex }) => {
		const rtStorageInd = probeInd
			.mul(6)
			.mul(faceSize)
			.add(faceIndex.mul(faceSize))
			.add(localIndex);

		const r = rtStorage.element(rtStorageInd).x;
		const g = rtStorage.element(rtStorageInd).y;
		const b = rtStorage.element(rtStorageInd).z;

		const linearColor = color(r, g, b);
		// convertColorSpace(
		// 	color(r, g, b, 1.0),
		// 	SRGBColorSpace,
		// 	LinearSRGBColorSpace,
		// );

		const ix = int(localIndex).mod(int(rtWidth));
		const iy = int(localIndex).div(int(rtWidth));
		const u_center = float(ix).add(0.5).div(rtWidth);
		const v_center = float(iy).add(0.5).div(rtWidth);
		const col = float(1.0).sub(u_center).mul(2.0).sub(1.0);
		const row = float(1.0).sub(v_center).mul(2.0).sub(1.0);

		// const u = float(localIndex).mod(rtWidth).div(rtWidth);
		// const v = float(localIndex).div(rtWidth).div(rtWidth);
		// const col = float(1).sub(u).mul(flip);
		// const row = float(1).sub(v);

		Switch(faceIndex)
			.Case(0, () => {
				coord.assign(vec3(negate(flip), row, col.mul(flip)));
			})
			.Case(1, () => {
				coord.assign(vec3(flip, row, negate(col).mul(flip)));
			})
			.Case(2, () => {
				coord.assign(vec3(col, float(1), negate(row)));
			})
			.Case(3, () => {
				coord.assign(vec3(col, negate(float(1)), row));
			})
			.Case(4, () => {
				coord.assign(vec3(col, row, float(1)));
			})
			.Case(5, () => {
				coord.assign(vec3(negate(col), row, negate(float(1))));
			});

		const len = coord.length();
		const weight = float(4).div(len.mul(len).mul(len));
		totalWeight.addAssign(weight);
		const dir = coord.normalize();

		const shBasis = array([
			float(0.282095),
			float(0.488603).mul(dir.y),
			float(0.488603).mul(dir.z),
			float(0.488603).mul(dir.x),
			float(1.092548).mul(dir.x).mul(dir.y),
			float(1.092548).mul(dir.y).mul(dir.z),
			float(0.315392).mul(float(3).mul(dir.z).mul(dir.z).sub(1)),
			float(1.092548).mul(dir.x).mul(dir.z),
			float(0.546274).mul(dir.x.mul(dir.x).sub(dir.y.mul(dir.y))),
		]);

		const weighedColor = linearColor.mul(weight);
		shCoefficients.element(0).addAssign(weighedColor.mul(shBasis.element(0)));
		shCoefficients.element(1).addAssign(weighedColor.mul(shBasis.element(1)));
		shCoefficients.element(2).addAssign(weighedColor.mul(shBasis.element(2)));
		shCoefficients.element(3).addAssign(weighedColor.mul(shBasis.element(3)));
		shCoefficients.element(4).addAssign(weighedColor.mul(shBasis.element(4)));
		shCoefficients.element(5).addAssign(weighedColor.mul(shBasis.element(5)));
		shCoefficients.element(6).addAssign(weighedColor.mul(shBasis.element(6)));
		shCoefficients.element(7).addAssign(weighedColor.mul(shBasis.element(7)));
		shCoefficients.element(8).addAssign(weighedColor.mul(shBasis.element(8)));
	});

	const norm = float(4).mul(PI).div(totalWeight);
	const coefIndex = probeInd.mul(SH_COEFFICIENTS_COUNT);

	shStorage.element(coefIndex.add(0)).x = norm.mul(shCoefficients.element(0).x);
	shStorage.element(coefIndex.add(0)).y = norm.mul(shCoefficients.element(0).y);
	shStorage.element(coefIndex.add(0)).z = norm.mul(shCoefficients.element(0).z);

	shStorage.element(coefIndex.add(1)).x = norm.mul(shCoefficients.element(1).x);
	shStorage.element(coefIndex.add(1)).y = norm.mul(shCoefficients.element(1).y);
	shStorage.element(coefIndex.add(1)).z = norm.mul(shCoefficients.element(1).z);

	shStorage.element(coefIndex.add(2)).x = norm.mul(shCoefficients.element(2).x);
	shStorage.element(coefIndex.add(2)).y = norm.mul(shCoefficients.element(2).y);
	shStorage.element(coefIndex.add(2)).z = norm.mul(shCoefficients.element(2).z);

	shStorage.element(coefIndex.add(3)).x = norm.mul(shCoefficients.element(3).x);
	shStorage.element(coefIndex.add(3)).y = norm.mul(shCoefficients.element(3).y);
	shStorage.element(coefIndex.add(3)).z = norm.mul(shCoefficients.element(3).z);

	shStorage.element(coefIndex.add(4)).x = norm.mul(shCoefficients.element(4).x);
	shStorage.element(coefIndex.add(4)).y = norm.mul(shCoefficients.element(4).y);
	shStorage.element(coefIndex.add(4)).z = norm.mul(shCoefficients.element(4).z);

	shStorage.element(coefIndex.add(5)).x = norm.mul(shCoefficients.element(5).x);
	shStorage.element(coefIndex.add(5)).y = norm.mul(shCoefficients.element(5).y);
	shStorage.element(coefIndex.add(5)).z = norm.mul(shCoefficients.element(5).z);

	shStorage.element(coefIndex.add(6)).x = norm.mul(shCoefficients.element(6).x);
	shStorage.element(coefIndex.add(6)).y = norm.mul(shCoefficients.element(6).y);
	shStorage.element(coefIndex.add(6)).z = norm.mul(shCoefficients.element(6).z);

	shStorage.element(coefIndex.add(7)).x = norm.mul(shCoefficients.element(7).x);
	shStorage.element(coefIndex.add(7)).y = norm.mul(shCoefficients.element(7).y);
	shStorage.element(coefIndex.add(7)).z = norm.mul(shCoefficients.element(7).z);

	shStorage.element(coefIndex.add(8)).x = norm.mul(shCoefficients.element(8).x);
	shStorage.element(coefIndex.add(8)).y = norm.mul(shCoefficients.element(8).y);
	shStorage.element(coefIndex.add(8)).z = norm.mul(shCoefficients.element(8).z);
});

/*

		// https://www.ppsloan.org/publications/StupidSH36.pdf



		for ( let faceIndex = 0; faceIndex < 6; faceIndex ++ ) {

			const image = cubeTexture.image[ faceIndex ];

			const width = image.width;
			const height = image.height;

			const canvas = document.createElement( 'canvas' );

			canvas.width = width;
			canvas.height = height;

			const context = canvas.getContext( '2d' );

			context.drawImage( image, 0, 0, width, height );

			const imageData = context.getImageData( 0, 0, width, height );

			const data = imageData.data;

			const imageWidth = imageData.width; // assumed to be square

			const pixelSize = 2 / imageWidth;

			for ( let i = 0, il = data.length; i < il; i += 4 ) { // RGBA assumed

				// pixel color
				color.setRGB( data[ i ] / 255, data[ i + 1 ] / 255, data[ i + 2 ] / 255 );

				// convert to linear color space
				convertColorToLinear( color, cubeTexture.colorSpace );

				// pixel coordinate on unit cube

				const pixelIndex = i / 4;

				const col = - 1 + ( pixelIndex % imageWidth + 0.5 ) * pixelSize;

				const row = 1 - ( Math.floor( pixelIndex / imageWidth ) + 0.5 ) * pixelSize;

				switch ( faceIndex ) {

					case 0: coord.set( - 1, row, - col ); break;

					case 1: coord.set( 1, row, col ); break;

					case 2: coord.set( - col, 1, - row ); break;

					case 3: coord.set( - col, - 1, row ); break;

					case 4: coord.set( - col, row, 1 ); break;

					case 5: coord.set( col, row, - 1 ); break;

				}

				// weight assigned to this pixel

				const lengthSq = coord.lengthSq();

				const weight = 4 / ( Math.sqrt( lengthSq ) * lengthSq );

				totalWeight += weight;

				// direction vector to this pixel
				dir.copy( coord ).normalize();

				// evaluate SH basis functions in direction dir
				SphericalHarmonics3.getBasisAt( dir, shBasis );

				// accumulate
				for ( let j = 0; j < 9; j ++ ) {

					shCoefficients[ j ].x += shBasis[ j ] * color.r * weight;
					shCoefficients[ j ].y += shBasis[ j ] * color.g * weight;
					shCoefficients[ j ].z += shBasis[ j ] * color.b * weight;

				}

			}

		}

		// normalize
		const norm = ( 4 * Math.PI ) / totalWeight;

		for ( let j = 0; j < 9; j ++ ) {

			shCoefficients[ j ].x *= norm;
			shCoefficients[ j ].y *= norm;
			shCoefficients[ j ].z *= norm;

		}

		return new LightProbe( sh );

*/
