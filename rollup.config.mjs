import terser from "@rollup/plugin-terser"

export default {
  input: "src/hotsock.js",
  output: [
    {
      file: "dist/hotsock.umd.js",
      format: "umd",
      name: "Hotsock",
    },
    {
      file: "dist/hotsock.umd.min.js",
      format: "umd",
      name: "Hotsock",
      plugins: [terser()],
    },
  ],
}
