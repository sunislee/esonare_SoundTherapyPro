// Web平台入口文件
import React from 'react';
import ReactDOM from 'react-dom';
import { AppRegistry } from 'react-native';

// 导入主应用逻辑
import '../index';

// 为Web平台渲染
if (typeof document !== 'undefined') {
  const rootTag = document.getElementById('root') || document.createElement('div');
  if (!document.getElementById('root')) {
    rootTag.id = 'root';
    document.body.appendChild(rootTag);
  }
  
  // 运行应用
  AppRegistry.runApplication('EsonareSound', {
    rootTag,
  });
}