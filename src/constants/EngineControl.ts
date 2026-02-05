
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

  public allow() {
    console.log('[EngineControl] Engine execution is now ALLOWED');
    this.allowed = true;
  }

  public disallow() {
    console.log('[EngineControl] Engine execution is now BLOCKED');
    this.allowed = false;
  }

  public isAllowed(): boolean {
    return this.allowed;
  }
}

export default EngineControl.getInstance();
