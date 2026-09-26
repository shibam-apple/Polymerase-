import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, runOnJS, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ease } from '../theme/motion';
import { DAY_INK } from '../theme';
import { GLASS_TIER } from '../ui/glass/capabilities';
import { InkProvider, T } from '../ui/Text';
import { PressableScale } from '../ui/controls';

/** Bottom sheet: dimmed backdrop, frosted panel sliding up; drag the grabber down to dismiss. */
export function Sheet({ onClose, bottom, children }: { onClose: () => void; bottom: number; children: ReactNode }) {
  const dy = useSharedValue(0);
  const drag = Gesture.Pan()
    .onChange(e => { dy.value = Math.max(0, dy.value + e.changeY); })
    .onEnd(e => {
      if (dy.value > 90 || e.velocityY > 800) runOnJS(onClose)();
      else dy.value = withSpring(0, { damping: 16, stiffness: 220 });
    });
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }] }));
  return (
    // A fragment, not a wrapper View: exit animations only run on the top level of the removed subtree.
    <>
      <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, { zIndex: 40, backgroundColor: 'rgba(0,0,0,.2)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(450).easing(ease.sheet)}
        exiting={SlideOutDown.duration(260)}
        style={{ position: 'absolute', zIndex: 41, left: 8, right: 8, bottom: 8 + bottom, alignItems: 'center' }}
      >
      <Animated.View style={[{ width: '100%', maxWidth: 520, borderRadius: 34, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.18)' }, a]}>
        {GLASS_TIER === 'live' && <BlurView intensity={80} tint="extraLight" blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TIER === 'live' ? 'rgba(250,250,252,.82)' : 'rgba(250,250,252,.97)', borderRadius: 34, borderWidth: 1, borderColor: 'rgba(255,255,255,.9)' }]} />
        <GestureDetector gesture={drag}>
          <View style={{ paddingTop: 10, paddingBottom: 12, alignItems: 'center' }}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(60,60,67,.22)' }} />
          </View>
        </GestureDetector>
        <View style={{ paddingHorizontal: 20, paddingBottom: 26 }}>
          <InkProvider value={DAY_INK}>{children}</InkProvider>
        </View>
      </Animated.View>
      </Animated.View>
    </>
  );
}

export function Toast({ text, onUndo, bottom }: { text: string; onUndo?: () => void; bottom: number }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(350).easing(ease.springSoft)}
      exiting={FadeOutDown.duration(200)}
      style={{ position: 'absolute', bottom: 104 + bottom, alignSelf: 'center', zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingRight: onUndo ? 10 : 18, paddingLeft: 18, borderRadius: 22, backgroundColor: 'rgba(29,29,31,.86)', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}
      accessibilityLiveRegion="polite"
    >
      <T size={14} weight="500" color="#fff">{text}</T>
      {onUndo && (
        <PressableScale onPress={onUndo} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.18)' }}>
          <T size={13} weight="600" color="#fff">Undo</T>
        </PressableScale>
      )}
    </Animated.View>
  );
}
