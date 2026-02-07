import React from 'react';
import { View, StyleSheet, Text, ScrollView } from 'react-native';
import LottieView from 'lottie-react-native';

const AnimationTestScreen = () => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Animation 120Hz Test</Text>
      
      <View style={styles.section}>
                <Text style={styles.label}>Download Loading (呼吸球 - 0.8x 倍速)</Text>
                <View style={styles.animationContainer}>
                  <LottieView
                    source={require('../assets/animations/download_loading.json')}
                    autoPlay
                    loop
                    speed={0.8}
                    style={styles.lottie}
                    hardwareAccelerationAndroid
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Download Loading (呼吸球 - 1.0x 标准倍速)</Text>
                <View style={styles.animationContainer}>
                  <LottieView
                    source={require('../assets/animations/download_loading.json')}
                    autoPlay
                    loop
                    style={styles.lottie}
                    hardwareAccelerationAndroid
                  />
                </View>
              </View>

      <View style={styles.section}>
        <Text style={styles.label}>Meditation Success (成功提示)</Text>
        <View style={styles.animationContainer}>
          <LottieView
            source={require('../assets/animations/meditation_success.json')}
            autoPlay
            loop={false}
            style={styles.lottie}
            hardwareAccelerationAndroid
          />
        </View>
      </View>
      
      <View style={styles.info}>
        <Text style={styles.infoText}>设备: Mac Studio (M1 Max)</Text>
        <Text style={styles.infoText}>目标: 120Hz 流畅度测试</Text>
        <Text style={styles.infoText}>架构: Native arm64</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6C5DD3',
    marginVertical: 30,
  },
  section: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 10,
  },
  animationContainer: {
    width: 300,
    height: 300,
    backgroundColor: '#111',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
  info: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    width: '100%',
  },
  infoText: {
    color: '#888',
    fontSize: 14,
    marginBottom: 5,
  },
});

export default AnimationTestScreen;
