// TakeoutBagIcon — custom "buy out / takeaway" glyph: a shopping bag with a
// fork & knife inside. No Lucide equivalent exists, so we render a hand-tuned
// outline SVG that matches the line weight of the Lucide icons it sits beside.
import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface TakeoutBagIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function TakeoutBagIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: TakeoutBagIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Bag body */}
      <Path
        d="M5 8h14a1 1 0 0 1 1 1v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a1 1 0 0 1 1-1z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {/* Handle */}
      <Path
        d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Fork */}
      <Path
        d="M8.3 11.2v2M9.4 11.2v2M10.5 11.2v2M8.3 13.2h2.2M9.4 13.2V18"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Knife */}
      <Path
        d="M14.4 11.2V18M14.4 11.2c1.5.3 1.5 3.2 0 3.6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
