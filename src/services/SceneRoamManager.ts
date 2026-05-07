/**
 * 场景内漫游管理器
 * 
 * 功能：
 * 1. 根据当前场景的 category，在同类场景间随机选择下一个
 * 2. 记录上次播放的场景，避免连续重复
 * 3. 提供 getNextRoamScene(currentSceneId) 方法
 * 
 * 日志规范：
 * [Roam] 🎲 - 漫游选择结果
 * [Roam] 🚫 - 避重逻辑触发
 * [Roam] ✅ - 漫游状态变更
 */

import { SCENES, Scene, SceneCategory } from '../constants/scenes';

class SceneRoamManager {
  private isRoaming = false;
  private roamCategory: SceneCategory | null = null;
  private lastPlayedSceneId: string | null = null;

  /**
   * 启动漫游模式
   * @param category 漫游的大类
   */
  startRoaming(category: SceneCategory) {
    this.isRoaming = true;
    this.roamCategory = category;
    this.lastPlayedSceneId = null;
    console.log(`[Roam] ✅ 漫游模式启动: ${category}`);
  }

  /**
   * 停止漫游模式
   */
  stopRoaming() {
    this.isRoaming = false;
    this.roamCategory = null;
    this.lastPlayedSceneId = null;
    console.log('[Roam] ✅ 漫游模式已停止');
  }

  /**
   * 是否处于漫游模式
   */
  getIsRoaming(): boolean {
    return this.isRoaming;
  }

  /**
   * 获取当前漫游的大类
   */
  getRoamCategory(): SceneCategory | null {
    return this.roamCategory;
  }

  /**
   * 获取指定分类下的所有大场景（isBaseScene: true）
   */
  private getBaseScenesByCategory(category: SceneCategory): Scene[] {
    return SCENES.filter(scene => scene.isBaseScene && scene.category === category);
  }

  /**
   * 获取下一个漫游场景
   * @param currentSceneId 当前场景 ID
   * @returns 下一个场景，如果没有可用场景则返回 null
   */
  getNextRoamScene(currentSceneId: string): Scene | null {
    if (!this.isRoaming || !this.roamCategory) {
      console.log('[Roam] ⚠️ 未处于漫游模式');
      return null;
    }

    const scenesInCategory = this.getBaseScenesByCategory(this.roamCategory);
    
    if (scenesInCategory.length === 0) {
      console.error('[Roam] ❌ 当前分类下没有可用场景');
      return null;
    }

    // 如果只有一个场景，直接返回
    if (scenesInCategory.length === 1) {
      console.log('[Roam] 🎲 仅有一个场景，直接返回');
      return scenesInCategory[0];
    }

    // 过滤掉当前正在播放的场景
    const availableScenes = scenesInCategory.filter(scene => scene.id !== currentSceneId);
    
    if (availableScenes.length === 0) {
      // 如果过滤后没有可用场景，说明当前场景是该分类下唯一的场景
      console.log('[Roam] 🎲 当前场景是该分类下唯一的场景');
      return scenesInCategory[0];
    }

    // 随机选择一个场景
    const randomIndex = Math.floor(Math.random() * availableScenes.length);
    const nextScene = availableScenes[randomIndex];

    // 记录上次播放的场景
    this.lastPlayedSceneId = nextScene.id;

    console.log(`[Roam] 🎲 漫游选中: ${nextScene.id} (${nextScene.title})`);
    return nextScene;
  }

  /**
   * 记录已播放的场景（用于避重）
   * @param sceneId 场景 ID
   */
  recordPlayedScene(sceneId: string) {
    this.lastPlayedSceneId = sceneId;
  }

  /**
   * 清除漫游历史记录并重置状态
   */
  clearHistory() {
    this.isRoaming = false;
    this.roamCategory = null;
    this.lastPlayedSceneId = null;
    console.log('[Roam] ✅ 漫游历史已清除');
  }
}

export const sceneRoamManager = new SceneRoamManager();
