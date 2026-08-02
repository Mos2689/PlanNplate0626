// Jest was already a devDependency but had never been configured or wired to a
// script, so the twelve test files under src/lib/__tests__ have not been running.
//
// Scope is deliberately the pure-TypeScript logic under src/lib: unit
// conversion, ingredient aggregation, and the failure system's classifier and
// copy guard. Component tests would need `jest-expo` plus a native mock layer,
// which isn't installed — so this covers the logic that can be tested honestly
// today rather than pretending to cover more.

module.exports = {
  // Previously this pointed at a hard-coded nested path
  // (`node_modules/jest-runner/node_modules/jest-environment-node`) to dodge a
  // hoisting artefact: react-native used to pull a 29.x `jest-environment-node`
  // to the top level while jest core was 30.x, and the mismatched pair threw
  // `this._moduleMocker.clearMocksOnScope is not a function` before any test
  // ran.
  //
  // That nested copy is an implementation detail of npm's tree, and it
  // disappeared the next time the tree was re-flattened — taking the whole test
  // suite with it. Resolving the package by name instead uses whichever copy is
  // actually installed (30.4.x at the top level today, matching jest core), and
  // survives re-installs either way.
  testEnvironment: require.resolve('jest-environment-node'),
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  transform: {
    // babel-preset-expo (already configured in babel.config.js) strips types.
    '^.+\\.[jt]sx?$': ['babel-jest', { caller: { name: 'metro', platform: 'ios' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // __DEV__ is a React Native global that library code branches on.
  globals: { __DEV__: true },
};
