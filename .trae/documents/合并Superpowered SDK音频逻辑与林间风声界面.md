## 修改计划

### 1. 保留现有SuperpoweredModule引用和初始化逻辑
- 保留第12-14行的NativeModules导入
- 保留第20-28行的useEffect初始化逻辑

### 2. 更新UI界面，保留林间风声美化设计
- 添加背景图和"林间风声"文字
- 保留播放/暂停按钮，并绑定到SuperpoweredModule.toggleAudio
- 添加"林间"、"雨夜"等场景切换按钮

### 3. 实现频率切换功能
- 为每个场景按钮添加对应的频率值
- 点击按钮时调用SuperpoweredModule.setFrequency()切换频率

### 4. 确保样式表语法正确
- 检查StyleSheet中的所有属性，确保逗号使用正确
- 修复可能存在的语法错误

### 5. 调整组件状态管理
- 保留isGenerating状态用于控制播放/暂停
- 添加currentFrequency状态用于显示当前频率

### 6. 修改按钮事件处理
- 播放/暂停按钮调用toggleAudio
- 场景按钮调用setFrequency并更新currentFrequency状态

## 预期修改后的App.js结构
```jsx
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';

// 导入原生模块
import { NativeModules } from 'react-native';
const { SuperpoweredModule } = NativeModules;

export default function App() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentFrequency, setCurrentFrequency] = useState(440);
  const [currentScene, setCurrentScene] = useState('林间');

  // 场景频率映射
  const sceneFrequencies = {
    '林间': 440,
    '雨夜': 528,
    '海浪': 639,
    '鸟鸣': 741,
    '溪流': 852,
  };

  useEffect(() => {
    // 初始化音频引擎
    SuperpoweredModule?.initialize();
  }, []);

  const toggleSound = () => {
    if (!SuperpoweredModule) {
      Alert.alert("错误", "原生模块未链接！");
      return;
    }

    SuperpoweredModule.toggleAudio(!isGenerating);
    setIsGenerating(!isGenerating);
  };

  const changeScene = (scene) => {
    if (!SuperpoweredModule) return;
    
    const frequency = sceneFrequencies[scene];
    SuperpoweredModule.setFrequency(frequency);
    setCurrentScene(scene);
    setCurrentFrequency(frequency);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 背景图和标题 */}
      <View style={styles.header}>
        <Text style={styles.mainTitle}>林间风声</Text>
      </View>

      {/* 播放/暂停按钮 */}
      <View style={styles.content}>
        <TouchableOpacity 
          style={[styles.playButton, isGenerating ? styles.pauseButton : styles.startButton]} 
          onPress={toggleSound}
        >
          <Text style={styles.buttonText}>
            {isGenerating ? '暂停' : '播放'}
          </Text>
        </TouchableOpacity>
        
        <Text style={styles.statusText}>
          当前频率: {currentFrequency}Hz
        </Text>
        <Text style={styles.sceneText}>
          当前场景: {currentScene}
        </Text>
      </View>

      {/* 场景切换按钮 */}
      <View style={styles.sceneContainer}>
        {Object.keys(sceneFrequencies).map((scene) => (
          <TouchableOpacity
            key={scene}
            style={[styles.sceneButton, currentScene === scene && styles.activeSceneButton]}
            onPress={() => changeScene(scene)}
          >
            <Text style={styles.sceneButtonText}>{scene}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 样式定义...
});
```