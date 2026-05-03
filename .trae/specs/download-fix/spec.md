# SoundTherapyPro 下载逻辑修复 - 产品需求文档

## Overview
- **Summary**: 修复 SoundTherapyPro 应用的下载逻辑问题，解决下载界面"嗖一下就过去"但资源未完整下载的问题，优化用户体验。
- **Purpose**: 确保首次启动时能真实下载必要的音频资源，避免用户进入应用后因资源缺失导致的功能异常。
- **Target Users**: 首次安装应用的用户。

## Goals
- 修复下载界面"嗖一下就过去"的问题，确保真实下载资源
- 优化 Core 资源检查逻辑，确保必要资源优先下载
- 改进下载进度显示，提供真实的下载状态反馈
- 增加失败处理机制，提高下载可靠性

## Non-Goals (Out of Scope)
- 不改变现有音频资源的存储结构
- 不修改音频资源的获取源（保持 GitHub 源）
- 不增加新的依赖库

## Background & Context
- 现有下载逻辑存在问题：用户看到下载界面快速闪过，但实际资源未完整下载
- Core 资源检查逻辑可能过于严格或存在缺陷
- 下载进度显示可能不准确，导致用户误以为下载已完成
- 缺少超时和失败处理机制，可能导致下载过程卡死

## Functional Requirements
- **FR-1**: 修复下载界面"嗖一下就过去"的问题，确保真实下载资源
- **FR-2**: 优化 Core 资源检查逻辑，确保必要资源优先下载
- **FR-3**: 改进下载进度显示，提供真实的下载状态反馈
- **FR-4**: 增加失败处理机制，提高下载可靠性

## Non-Functional Requirements
- **NFR-1**: 下载过程应在 30 秒内完成 Core 资源的下载（网络正常情况下）
- **NFR-2**: 下载失败时应提供明确的错误提示
- **NFR-3**: 下载进度显示应真实反映实际下载状态

## Constraints
- **Technical**: 保持现有的 React Native 0.73 版本和现有依赖
- **Business**: 不改变现有的音频资源获取方式
- **Dependencies**: 依赖 GitHub 源获取音频资源

## Assumptions
- 网络连接正常，GitHub 源可访问
- 用户设备有足够的存储空间
- 现有音频资源的 URL 和大小信息是正确的

## Acceptance Criteria

### AC-1: 下载界面不再"嗖一下就过去"
- **Given**: 用户首次启动应用
- **When**: 进入下载界面
- **Then**: 下载界面应显示真实的下载进度，不会快速闪过
- **Verification**: `human-judgment`

### AC-2: Core 资源优先下载
- **Given**: 用户首次启动应用
- **When**: 开始下载资源
- **Then**: Core 资源（如启动音效、主界面基础素材）应优先下载
- **Verification**: `programmatic`

### AC-3: 下载进度显示准确
- **Given**: 用户首次启动应用
- **When**: 下载资源时
- **Then**: 进度条应真实反映下载状态，不会显示虚假的完成状态
- **Verification**: `human-judgment`

### AC-4: 下载失败处理
- **Given**: 网络连接不稳定
- **When**: 下载资源时
- **Then**: 应用应能处理下载失败的情况，不会卡死
- **Verification**: `programmatic`

## Open Questions
- [ ] 具体的 Core 资源列表是否需要调整？
- [ ] 下载超时时间设置为多少合适？
- [ ] 下载失败后是否需要自动重试？