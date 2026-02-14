/**
 * HapticFeedback - Provides vibration feedback for mobile gameplay events.
 * Uses the Vibration API (navigator.vibrate) with feature detection.
 * iOS Safari does not support the Vibration API.
 */

export class HapticFeedback {
  private static enabled = true;
  private static supported: boolean | null = null;

  static isSupported(): boolean {
    if (this.supported === null) {
      this.supported =
        typeof navigator !== 'undefined' && 'vibrate' in navigator;
    }
    return this.supported;
  }

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static isEnabled(): boolean {
    return this.enabled && this.isSupported();
  }

  private static vibrate(pattern: number | number[]): void {
    if (!this.isEnabled()) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Silently fail if vibration is blocked
    }
  }

  /** Light tap - button press feedback */
  static tap(): void {
    this.vibrate(15);
  }

  /** Collision with barrier */
  static collision(): void {
    this.vibrate([80, 40, 80]);
  }

  /** Crossing finish line / checkpoint */
  static checkpoint(): void {
    this.vibrate(100);
  }

  /** Race complete celebration */
  static raceComplete(): void {
    this.vibrate([60, 30, 60, 30, 120]);
  }

  /** Handbrake / drift feedback */
  static drift(): void {
    this.vibrate(30);
  }

  /** Stop any active vibration */
  static stop(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(0);
      } catch {
        // Silently fail
      }
    }
  }
}
