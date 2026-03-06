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
    {
      file: "dist/hotsock.esm.js",
      format: "es",
    },
    {
      file: "dist/hotsock.esm.min.js",
      format: "es",
      plugins: [terser()],
    },
  ],
}
