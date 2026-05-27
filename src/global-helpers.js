import { Fn, float, max, min, negate, uniform, vec2 } from "three/tsl";
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
} from "./constants";

export const considerAngleUniform = uniform(CONSIDER_ANGLE);
export const interpolatedUniform = uniform(INTERPOLATE);
export const useStreetGridUniform = uniform(PROBE_GRID_TYPE == "street");

export const probeLightIntensityUniform = uniform(float(PROBE_INTENSITY));
export const directLightIntensityUniform = uniform(float(DIRECT_INTENSITY));
export const irradianceLightIntensityUniform = uniform(
	float(IRRAIDANCE_INTENSITY),
);

export const blurProbeCoeffsUniform = uniform(float(BLUR_PROBE_COEF));
export const enterShadowAreaUniform = uniform(float(ENTER_SHADOW_AREA));
export const shadowAreaBlurUniform = uniform(float(SHADOW_AREA_BLUR));

export const gridWidthUniform = uniform(float(GRID_WIDTH));
export const gridHeightUniform = uniform(float(GRID_HEIGHT));
export const probeCountUniform = uniform(float(PROBE_COUNT));
export const layerCountUniform = uniform(float(LAYER_COUNT));

export const getWorldCoordsFromDepthUV = Fn(([uv]) => {
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

export const getDepthUVFromWorldCoords = Fn(([pos]) => {
	const x = max(min(pos.x, DEPTH_CAMERA_RIGHT), DEPTH_CAMERA_LEFT);
	const y = max(min(pos.y, DEPTH_CAMERA_BOTTOM), DEPTH_CAMERA_TOP);

	const width = float(DEPTH_CAMERA_RIGHT).sub(DEPTH_CAMERA_LEFT);
	const height = float(DEPTH_CAMERA_BOTTOM).sub(DEPTH_CAMERA_TOP);

	return vec2(
		x.add(width.div(2)).div(width).mul(DEPTH_WIDTH),
		negate(y).add(height.div(2)).div(height).mul(DEPTH_HEIGHT),
	);
});
