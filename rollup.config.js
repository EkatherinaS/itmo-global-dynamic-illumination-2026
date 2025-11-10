import resolve from "@rollup/plugin-node-resolve";
import postcss from "rollup-plugin-postcss";
import copy from "rollup-plugin-copy";
import terser from "@rollup/plugin-terser";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

const dev = process.env.ROLLUP_WATCH === "true";

export default {
	input: "src/main.js",
	output: {
		dir: "docs",
		format: "es",
		sourcemap: true,
	},
	plugins: [
		resolve(),
		postcss({
			extract: "style.css",
			minimize: !dev,
		}),
		copy({
			targets: [
				{ src: "index.html", dest: "docs" },
				{ src: "public/**/*", dest: "docs/public" },
			],
		}),
		!dev && terser(),
		dev &&
			serve({
				open: true,
				contentBase: "docs",
				port: 3000,
			}),
		dev &&
			livereload({
				watch: "docs",
				delay: 200,
			}),
	],
};
