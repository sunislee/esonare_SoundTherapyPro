---
alwaysApply: false
description: 
---
[Environment & Runtime Rules]

iOS Development: Always prioritize iOS Simulator for debugging.

Default Device: Use "iPhone 16" (or your preferred model) as the default simulator.

Build Command: Use npx react-native run-ios without specific device flags unless requested.

Safe Area: For iOS, strictly enforce SafeAreaView usage to handle the Notch and Home Indicator.