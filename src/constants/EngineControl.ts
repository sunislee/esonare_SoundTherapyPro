
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
    this.allowed = true;
  }

  public disallow() {
    this.allowed = false;
  }

  public isAllowed(): boolean {
    return this.allowed;
  }
}

export default EngineControl.getInstance();
