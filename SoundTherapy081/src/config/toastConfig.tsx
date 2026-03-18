import React from 'react';
import { StyleSheet, View, Text, Platform, TextStyle } from 'react-native';
import { BaseToast, ErrorToast, ToastConfig } from 'react-native-toast-message';

const commonToastStyle: any = {
  backgroundColor: 'rgba(0, 0, 0, 0.8)', // User requested 0.8
  borderRadius: 24, // Increased border radius for more "rounded" look
  height: 'auto',
  paddingVertical: 12,
  paddingHorizontal: 24,
  marginTop: 20,
  width: '90%',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.5, // Slightly stronger shadow for contrast
  shadowRadius: 16,
  elevation: 10, // Explicit elevation for Android
  zIndex: 9999,
  borderLeftWidth: 0,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.2)', // Light subtle border
  position: 'absolute',
  alignSelf: 'center',
};

const text1Style: TextStyle = {
  fontSize: 16,
  fontWeight: '600',
  color: '#FFFFFF',
  textAlign: 'center',
};

const text2Style: TextStyle = {
  fontSize: 13,
  color: 'rgba(255, 255, 255, 0.8)',
  marginTop: 4,
  textAlign: 'center',
};

const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={commonToastStyle}
      contentContainerStyle={styles.contentContainer}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={{...commonToastStyle, borderLeftWidth: 0}} // Ensure no colored strip
      contentContainerStyle={styles.contentContainer}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={{...commonToastStyle, borderLeftWidth: 0}}
      contentContainerStyle={styles.contentContainer}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  ),
};

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
});

export default toastConfig;
