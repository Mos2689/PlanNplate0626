import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';

interface BrandLogoProps {
  size?: number;
  color?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 60, color = '#e46d46' }) => {
  const strokeWidth = size / 15;

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <G>
          {/* Plate circle */}
          <Circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
          />

          {/* Plate rim */}
          <Circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth * 0.8}
            opacity="0.6"
          />

          {/* Fork on left */}
          <G>
            <Path
              d="M 30 35 L 30 65 M 25 40 L 35 40 M 25 50 L 35 50 M 25 60 L 35 60"
              stroke={color}
              strokeWidth={strokeWidth * 0.9}
              fill="none"
              strokeLinecap="round"
            />
          </G>

          {/* Knife on right */}
          <G>
            <Path
              d="M 70 35 L 70 65"
              stroke={color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
            <Circle cx="70" cy="35" r={strokeWidth * 1.5} fill={color} />
          </G>
        </G>
      </Svg>
    </View>
  );
};
