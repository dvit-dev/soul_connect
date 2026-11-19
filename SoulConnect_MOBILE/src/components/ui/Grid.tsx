import React from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';

interface GridProps {
  columns: number;
  gap?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Wrapping grid: each child takes 1/columns of the row; cells in a row stretch to equal height. */
export function Grid({columns, gap = 12, children, style}: GridProps) {
  const items = React.Children.toArray(children).filter(Boolean);
  const cellWidth = `${100 / columns}%` as const;
  return (
    <View style={[{flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2}, style]}>
      {items.map((child, index) => (
        <View
          key={(React.isValidElement(child) && child.key) || index}
          style={{width: cellWidth, paddingHorizontal: gap / 2, marginBottom: gap}}>
          {child}
        </View>
      ))}
    </View>
  );
}
