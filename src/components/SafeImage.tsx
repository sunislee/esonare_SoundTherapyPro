import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

interface SafeImageProps {
  source: { uri: string } | number;
  style?: any;
}

export const SafeImage: React.FC<SafeImageProps> = ({ source, style }) => {
  const [hasError, setHasError] = React.useState(false);

  return hasError ? (
    <View style={[styles.placeholderContainer, style]} />
  ) : (
    <Image
      source={source}
      style={style}
      onError={() => setHasError(true)}
      resizeMode="cover"
    />
  );
};

const styles = StyleSheet.create({
  placeholderContainer: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
