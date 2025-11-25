import resolve from "@rollup/plugin-node-resolve";
import postcss from "rollup-plugin-postcss";
import copy from "rollup-plugin-copy";
import terser from "@rollup/plugin-terser";
import commonjs from "@rollup/plugin-commonjs";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

const dev = process.env.ROLLUP_WATCH === "true";

export default {
	input: "src/main.js",
	output: {
		dir: "dist",
		format: "es",
		sourcemap: true,
	},
	plugins: [
		resolve(),
		commonjs(),
		postcss({
			extract: "style.css",
			minimize: !dev,
		}),
		copy({
			targets: [
				{ src: "index.html", dest: "dist" },
				{ src: "public/**/*", dest: "dist/public" },
			],
		}),
		!dev && terser(),
		dev &&
			serve({
				open: true,
				contentBase: "dist",
				port: 3000,
			}),
		dev &&
			livereload({
				watch: "dist",
				delay: 200,
			}),
	],
};
