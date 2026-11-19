import {useMemo} from 'react';
import {useWindowDimensions, ViewStyle} from 'react-native';

/**
 * Breakpoints are based on the current window width in dp, so they react to
 * rotation, foldables opening/closing, iPad Split View and Android multi-window.
 *   compact  < 600   phones, folded foldables
 *   medium   600–899 small tablets, unfolded foldables, phones in landscape
 *   expanded ≥ 900   large tablets / iPad landscape
 */
export const breakpoints = {medium: 600, expanded: 900};

/** Max widths for centered content columns. */
export const maxWidths = {
  form: 520,
  reading: 760,
  wide: 1100,
};

export type SizeClass = 'compact' | 'medium' | 'expanded';

export function sizeClassFor(width: number): SizeClass {
  if (width >= breakpoints.expanded) {
    return 'expanded';
  }
  if (width >= breakpoints.medium) {
    return 'medium';
  }
  return 'compact';
}

export function useResponsive() {
  const {width, height} = useWindowDimensions();
  return useMemo(() => {
    const sizeClass = sizeClassFor(width);
    const isTablet = Math.min(width, height) >= breakpoints.medium;
    const gutter = sizeClass === 'compact' ? 16 : sizeClass === 'medium' ? 24 : 32;
    return {
      width,
      height,
      sizeClass,
      isCompact: sizeClass === 'compact',
      isTablet,
      isLandscape: width > height,
      gutter,
      /** Number of columns that fit if each item needs at least `minItemWidth` dp. */
      columns(minItemWidth: number, max = 4, available = width) {
        return Math.max(1, Math.min(max, Math.floor((available - gutter * 2) / minItemWidth)));
      },
      /** Font scale-up for large screens (kept modest so text stays readable). */
      font(size: number) {
        return sizeClass === 'expanded' ? Math.round(size * 1.15) : sizeClass === 'medium' ? Math.round(size * 1.08) : size;
      },
    };
  }, [width, height]);
}

/** Style for a centered content column capped at `maxWidth`. */
export function centered(maxWidth: number): ViewStyle {
  return {width: '100%', maxWidth, alignSelf: 'center'};
}

/** Width for an item in an N-column wrapping grid with a given gap. */
export function gridItemWidth(containerWidth: number, columns: number, gap: number): number {
  return Math.floor((containerWidth - gap * (columns - 1)) / columns);
}
