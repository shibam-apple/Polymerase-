import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { View } from 'react-native';

/**
 * Web only: Skia needs CanvasKit (WebAssembly) loaded before any Skia module runs, so the app is
 * imported lazily. `public/canvaskit.wasm` is copied from node_modules by `scripts/copy-canvaskit.js`.
 */
export default function Entry() {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `/${file}` }}
      getComponent={() => import('./Root')}
      fallback={<View style={{ flex: 1, backgroundColor: '#f4f4f7' }} />}
    />
  );
}
