import React from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

interface ProgressCircleProps {
  progress: number; // 0-1
  activeColor: string;
  inactiveColor: string;
  size?: number;
  strokeWidth?: number;
  icon: React.ReactNode;
  isDark: boolean;
}

export const ProgressCircle: React.FC<ProgressCircleProps> = ({
  progress,
  activeColor,
  inactiveColor,
  size = 64,
  strokeWidth = 3,
  icon,
  isDark,
}) => {
  const animatedProgress = useSharedValue(0);
  const halfSize = size / 2;

  React.useEffect(() => {
    animatedProgress.value = withSpring(progress, {
      damping: 15,
      mass: 1,
      overshootClamping: true,
    });
  }, [progress, animatedProgress]);

  // Right half rotation (0-50% progress = 0-180 degrees)
  const rightHalfStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      animatedProgress.value,
      [0, 0.5, 1],
      [0, 180, 180],
      Extrapolate.CLAMP
    );
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  // Left half rotation (50-100% progress = 0-180 degrees)
  const leftHalfStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      animatedProgress.value,
      [0, 0.5, 1],
      [0, 0, 180],
      Extrapolate.CLAMP
    );
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });

  // Hide left progress until we hit 50%
  const leftHalfOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedProgress.value,
      [0, 0.49, 0.5, 1],
      [0, 0, 1, 1],
      Extrapolate.CLAMP
    );
    return { opacity };
  });

  // Hide right progress when at 0%
  const rightHalfOpacity = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedProgress.value,
      [0, 0.01, 1],
      [0, 1, 1],
      Extrapolate.CLAMP
    );
    return { opacity };
  });

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      {/* Background circle */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: halfSize,
          backgroundColor: isDark ? 'rgba(107, 125, 86, 0.1)' : 'rgba(218, 180, 105, 0.2)',
        }}
      />

      {/* Inactive border ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: halfSize,
          borderWidth: strokeWidth,
          borderColor: inactiveColor,
          opacity: 0.3,
        }}
      />

      {/* Right half container - clips the right semi-circle */}
      <View
        style={{
          position: 'absolute',
          width: halfSize,
          height: size,
          left: halfSize,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: size,
              height: size,
              left: -halfSize,
              borderRadius: halfSize,
              borderWidth: strokeWidth,
              borderColor: activeColor,
              borderLeftColor: 'transparent',
              borderBottomColor: 'transparent',
            },
            rightHalfStyle,
            rightHalfOpacity,
          ]}
        />
      </View>

      {/* Left half container - clips the left semi-circle */}
      <View
        style={{
          position: 'absolute',
          width: halfSize,
          height: size,
          left: 0,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: size,
              height: size,
              left: 0,
              borderRadius: halfSize,
              borderWidth: strokeWidth,
              borderColor: activeColor,
              borderRightColor: 'transparent',
              borderTopColor: 'transparent',
            },
            leftHalfStyle,
            leftHalfOpacity,
          ]}
        />
      </View>

      {/* Icon in center */}
      <View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center' }}>
        {icon}
      </View>
    </View>
  );
};
