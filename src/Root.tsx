import { HealthApp } from './HealthApp';
import { HeartProvider } from './state/heart';
import { StoreProvider } from './state/store';
import { GlassProvider } from './ui/glass/Glass';

export default function Root() {
  return (
    <StoreProvider>
      <GlassProvider>
        <HeartProvider>
          <HealthApp />
        </HeartProvider>
      </GlassProvider>
    </StoreProvider>
  );
}
