import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

export type StrokeProps = {
  sample: (x: number, y: number, start: boolean) => void;
  end: () => void;
};

export default function StrokeSurface({ sample, end }: StrokeProps) {
  const finger = useRef<number | null>(null);
  return (
    <View
      testID="world"
      accessibilityLabel="Simulation canvas"
      collapsable={false}
      style={StyleSheet.absoluteFill}
      onTouchStart={({ nativeEvent }) => {
        const touch = nativeEvent.changedTouches[0];
        if (!touch || finger.current !== null) return;
        finger.current = touch.identifier;
        sample(touch.locationX, touch.locationY, true);
      }}
      onTouchMove={({ nativeEvent }) => {
        const touch = nativeEvent.changedTouches.find((t) => t.identifier === finger.current);
        if (touch) sample(touch.locationX, touch.locationY, false);
      }}
      onTouchEnd={({ nativeEvent }) => {
        const touch = nativeEvent.changedTouches.find((t) => t.identifier === finger.current);
        if (!touch) return;
        sample(touch.locationX, touch.locationY, false);
        finger.current = null;
        end();
      }}
      onTouchCancel={() => {
        finger.current = null;
        end();
      }}
    />
  );
}
