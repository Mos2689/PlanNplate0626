// App-wide theme source. The app is locked to LIGHT mode regardless of the
// device's system appearance — every screen reads the theme through this hook,
// so returning 'light' here forces the whole UI light in one place.
//
// To restore device-driven light/dark later, revert this file to:
//   export { useColorScheme } from 'react-native';
// (and set userInterfaceStyle back to "automatic" in app.json). All the
// dark-mode branches remain in the codebase; they simply never activate.
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
