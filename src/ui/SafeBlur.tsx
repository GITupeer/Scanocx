import { requireOptionalNativeModule } from "expo-modules-core";
import type { ComponentProps, ReactElement } from "react";
import { View, type ViewProps } from "react-native";

type ExpoBlur = typeof import("expo-blur");
type BlurViewProps = ComponentProps<ExpoBlur["BlurView"]>;
type BlurTargetProps = ComponentProps<ExpoBlur["BlurTargetView"]>;

/** `true` tylko gdy w binarnym buildzie jest natywny moduł ExpoBlur. */
export const isExpoBlurAvailable =
  requireOptionalNativeModule("ExpoBlur") != null;

let blurModule: ExpoBlur | null = null;

function getExpoBlur(): ExpoBlur | null {
  if (!isExpoBlurAvailable) return null;
  if (!blurModule) {
    // Lazy require — na starym buildzie w ogóle nie ładujemy natywnych view managerów.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    blurModule = require("expo-blur") as ExpoBlur;
  }
  return blurModule;
}

export function SafeBlurTargetView(props: BlurTargetProps): ReactElement {
  const blur = getExpoBlur();
  if (!blur) {
    return <View {...(props as ViewProps)} />;
  }
  return <blur.BlurTargetView {...props} />;
}

export function SafeBlurView(props: BlurViewProps): ReactElement {
  const blur = getExpoBlur();
  if (!blur) {
    const {
      blurTarget: _blurTarget,
      intensity: _intensity,
      tint: _tint,
      blurMethod: _blurMethod,
      blurReductionFactor: _blurReductionFactor,
      experimentalBlurMethod: _experimentalBlurMethod,
      ...rest
    } = props;
    return <View {...rest} />;
  }
  return <blur.BlurView {...props} />;
}
