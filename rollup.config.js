import resolve from "@rollup/plugin-node-resolve";
import postcss from "rollup-plugin-postcss";
import copy from "rollup-plugin-copy";
import terser from "@rollup/plugin-terser";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

export default {
	input: "src/main.js",
	output: {
		dir: "dist",
		format: "es",
		sourcemap: true,
	},
	plugins: [
		resolve(),
		postcss({
			extract: "style.css",
			minimize: true,
		}),
		copy({
			targets: [
				{ src: "index.html", dest: "dist" },
				{ src: "public/**/*", dest: "dist/public" },
			],
		}),
		terser(),
		serve({
			open: true,
			contentBase: "dist",
			port: 3000,
		}),
		livereload({
			watch: "dist",
			delay: 200,
		}),
	],
};
