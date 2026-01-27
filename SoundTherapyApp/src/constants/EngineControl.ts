/**
 * 音频引擎控制器 (单例)
 * 用于管理音频引擎的启动权限，防止在资源未就绪时初始化导致红屏/崩溃
 */
class EngineControl {
  private static instance: EngineControl;
  private allowed: boolean = false;

  private constructor() {}

  public static getInstance(): EngineControl {
    if (!EngineControl.instance) {
      EngineControl.instance = new EngineControl();
    }
    return EngineControl.instance;
  }

  /**
   * 允许引擎启动
   */
  public allow() {
    console.log('[EngineControl] Engine execution is now ALLOWED');
    this.allowed = true;
  }

  /**
   * 禁止引擎启动
   */
  public disallow() {
    console.log('[EngineControl] Engine execution is now BLOCKED');
    this.allowed = false;
  }

  /**
   * 检查是否允许执行
   */
  public isAllowed(): boolean {
    return this.allowed;
  }
}

export default EngineControl.getInstance();
