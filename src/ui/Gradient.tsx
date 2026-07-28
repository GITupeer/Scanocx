import { View } from 'react-native';
import type { ViewProps } from 'react-native';

type Props = ViewProps & {
  /** Kolejne kolory gradientu (min. 2). */
  colors: readonly string[];
  /** Kąt w stopniach CSS: 90 = w prawo, 180 = w dół, 135 = w prawy dolny róg. */
  angle?: number;
  /** Pozycje stopni 0…1 — tyle samo, ile kolorów. */
  locations?: readonly number[];
  /** Kolor tła, gdy gradient nie zostanie wyrenderowany. */
  fallbackColor?: string;
};

/**
 * Gradient na wbudowanym w React Native `experimental_backgroundImage`,
 * bez dodatkowego modułu natywnego. Solidny kolor tła zostaje jako zapas.
 */
export function Gradient({
  colors,
  angle = 135,
  locations,
  fallbackColor,
  style,
  children,
  ...rest
}: Props) {
  const stops = colors
    .map((color, index) => {
      const at = locations?.[index];
      return at == null ? color : `${color} ${Math.round(at * 100)}%`;
    })
    .join(', ');

  return (
    <View
      {...rest}
      style={[
        { backgroundColor: fallbackColor ?? colors[Math.min(1, colors.length - 1)] },
        style,
        { experimental_backgroundImage: `linear-gradient(${angle}deg, ${stops})` },
      ]}>
      {children}
    </View>
  );
}
