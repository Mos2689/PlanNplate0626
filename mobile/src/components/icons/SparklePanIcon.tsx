import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function SparklePanIcon({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: any) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Main Pan Body */}
      <Path d="M4 12h12" />
      <Path d="M4 12a6 6 0 0 0 12 0" />
      
      {/* Pan Handle */}
      <Path d="M16 12l4-4" />
      
      {/* Small Sparkles */}
      <Path d="M9 4v2" />
      <Path d="M8 5h2" />
      
      <Path d="M19 13v2" />
      <Path d="M18 14h2" />
      
      <Path d="M3 7v2" />
      <Path d="M2 8h2" />
    </Svg>
  );
}
