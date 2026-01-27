import {AppRegistry} from 'react-native';
import App from './App';
// 这一行可以留着，也可以删掉，只要最后一行改了就行
import {name as appName} from './package.json'; 

// 直接改成下面这样：
AppRegistry.registerComponent('RainyStudy', () => App);