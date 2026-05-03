import {
	instanceIndex,
	textureLoad,
	textureStore,
	uvec2,
	Fn,
	float,
} from "three/tsl";
import { depthTexture, depthTextureTest, WIDTH } from "./constants";

export const computeDepthTextureTest = Fn(() => {
	const indX = instanceIndex.mod(WIDTH);
	const indY = instanceIndex.div(WIDTH);
	const indexUV = uvec2(indX, indY);
	const value = textureLoad(depthTexture, indexUV);
	textureStore(depthTextureTest, indexUV, value).toReadWrite();
});
