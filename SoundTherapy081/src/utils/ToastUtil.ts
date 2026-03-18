import Toast from 'react-native-toast-message';

/**
 * Global Toast Utility Class
 * Encapsulates react-native-toast-message for consistent usage across the app.
 */
class ToastUtil {
  private static isInitialized = false;

  /**
   * Initialize the Toast utility
   */
  static init() {
    this.isInitialized = true;
  }

  /**
   * Show a success toast
   * @param message The main message to display
   * @param description Optional description
   */
  static success(message: string, description?: string) {
    if (!this.isInitialized) return;
    Toast.show({
      type: 'success',
      text1: message,
      text2: description,
      position: 'top',
    });
  }

  /**
   * Show an error toast
   * @param message The main message to display
   * @param description Optional description
   */
  static error(message: string, description?: string) {
    if (!this.isInitialized) return;
    Toast.show({
      type: 'error',
      text1: message,
      text2: description,
      position: 'top',
    });
  }

  /**
   * Show an info toast
   * @param message The main message to display
   * @param description Optional description
   */
  static info(message: string, description?: string) {
    if (!this.isInitialized) return;
    Toast.show({
      type: 'info',
      text1: message,
      text2: description,
      position: 'top',
    });
  }
  
  /**
   * Hide the current toast
   */
  static hide() {
    Toast.hide();
  }
}

export default ToastUtil;
