module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", unstable_transformImportMeta: true }],
      "nativewind/babel",
    ],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
            "@/shared": "./shared",
            "better-auth/react": "./node_modules/better-auth/dist/client/react/index.cjs",
            "better-auth/client/plugins":
              "./node_modules/better-auth/dist/client/plugins/index.cjs",
            "@better-auth/expo/client": "./node_modules/@better-auth/expo/dist/client.cjs",
          },
        },
      ],
      "@babel/plugin-proposal-export-namespace-from",
      "react-native-worklets/plugin",
    ],
    env: {
      // PERF: the app ships ~700 console.* calls, concentrated on hot paths
      // (openai.ts, database.ts, store.ts, auth-store.ts). In a release build
      // these still execute — formatting arguments and allocating strings on
      // the JS thread — even though nothing is listening. Stripping log/debug/
      // info from production removes that work entirely.
      //
      // `error` and `warn` are kept: crash reporting and the app's own error
      // paths rely on them, and they only fire on exceptional branches.
      production: {
        plugins: [
          ["transform-remove-console", { exclude: ["error", "warn"] }],
        ],
      },
    },
  };
};
