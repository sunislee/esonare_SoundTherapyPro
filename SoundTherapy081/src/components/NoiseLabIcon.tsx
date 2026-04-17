import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Rect } from 'react-native-svg';

/**
 * NoiseLabIcon - 降噪实验室图标
 * 
 * 设计理念：
 * - 盾牌/烧瓶形状（代表专业与保护）
 * - 左侧杂乱声波（噪音）→ 右侧平滑声波（降噪后）
 * - 科技蓝渐变 (#0047AB → #4169E1)
 * - 扁平化设计，小尺寸清晰可辨
 */
const NoiseLabIcon: React.FC<{ size?: number }> = ({ size = 24 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Defs>
          {/* 盾牌渐变：深蓝到淡蓝 */}
          <LinearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0047AB" />
            <Stop offset="100%" stopColor="#4169E1" />
          </LinearGradient>
          
          {/* 金属光泽边缘 */}
          <LinearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#C0C0C0" />
            <Stop offset="50%" stopColor="#FFFFFF" />
            <Stop offset="100%" stopColor="#C0C0C0" />
          </LinearGradient>
        </Defs>

        {/* 盾牌形状（实验室保护） */}
        <Path
          d="M24 4 L40 12 L40 24 C40 34 32 42 24 44 C16 42 8 34 8 24 L8 12 Z"
          fill="url(#shieldGrad)"
          stroke="url(#edgeGrad)"
          strokeWidth="1.5"
        />

        {/* 左侧：杂乱破碎声波（噪音） */}
        <Path
          d="M14 20 L16 16 L18 22 L20 14 L22 24"
          fill="none"
          stroke="#FF6B6B"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        
        {/* 左侧额外杂波 */}
        <Path
          d="M15 26 L17 23 L19 28 L21 25"
          fill="none"
          stroke="#FF8C8C"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />

        {/* 中心：过滤线（烧瓶颈部） */}
        <Rect
          x="23"
          y="14"
          width="2"
          height="20"
          fill="#FFFFFF"
          opacity="0.3"
          rx="1"
        />

        {/* 右侧：平滑单弦声波（降噪后） */}
        <Path
          d="M26 24 C28 18 30 18 32 24 C34 30 36 30 38 24"
          fill="none"
          stroke="#4ADE80"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        
        {/* 右侧平滑波辅助线 */}
        <Path
          d="M27 24 C29 20 31 20 33 24 C35 28 37 28 37 24"
          fill="none"
          stroke="#86EFAC"
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.5"
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NoiseLabIcon;
