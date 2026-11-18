import React from 'react';
import { Text } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

export default function App() {
  return (
    <WithSkiaWeb
      getComponent={() => import('./src/Lab')}
      opts={{ locateFile: () => '/canvaskit.wasm' }}
      fallback={<Text style={{ padding: 24 }}>Opening Siftwake…</Text>}
    />
  );
}
