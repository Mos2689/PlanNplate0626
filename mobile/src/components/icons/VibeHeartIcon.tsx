// VibeHeartIcon — custom "radiating heart" icon for the Vibe Cooking
// quick-action tile. No Lucide equivalent exists, so we render a
// hand-tuned SVG: a heart silhouette with 12 radiating burst lines.
import React from 'react';
import Svg, { Path, Line } from 'react-native-svg';

interface VibeHeartIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function VibeHeartIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: VibeHeartIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Heart */}
      <Path
        d="M12 7.5C12 5 10.5 3.5 8.5 3.5C6.5 3.5 5 5.5 5 7.5C5 12 12 16.5 12 16.5C12 16.5 19 12 19 7.5C19 5.5 17.5 3.5 15.5 3.5C13.5 3.5 12 5 12 7.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Radiating rays — 12 lines arranged like a sunburst */}
      {/* Top */}
      <Line x1="12" y1="1" x2="12" y2="2.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Bottom */}
      <Line x1="12" y1="19" x2="12" y2="20.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Left */}
      <Line x1="2" y1="10" x2="3.5" y2="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Right */}
      <Line x1="20.5" y1="10" x2="22" y2="10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />

      {/* Top-left */}
      <Line x1="4.2" y1="3.2" x2="5.3" y2="4.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Top-right */}
      <Line x1="18.7" y1="4.3" x2="19.8" y2="3.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Bottom-left */}
      <Line x1="4.2" y1="16.8" x2="5.3" y2="15.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Bottom-right */}
      <Line x1="18.7" y1="15.7" x2="19.8" y2="16.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />

      {/* Mid top-left */}
      <Line x1="3" y1="6" x2="4.3" y2="6.7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Mid top-right */}
      <Line x1="19.7" y1="6.7" x2="21" y2="6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Mid bottom-left */}
      <Line x1="3" y1="14" x2="4.3" y2="13.3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Mid bottom-right */}
      <Line x1="19.7" y1="13.3" x2="21" y2="14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}
