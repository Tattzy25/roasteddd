export const SessionConfig = {
  interruptionLockMs: 7000,      // Your 7-second rule
  pressureCookerMs: 120000,      // Your 2-minute rule
  enableInterruptionLock: true,  // Toggle for your dashboard
  enablePressureCooker: true,    // Toggle for your dashboard
};

export const sessionManager = {
  /**
   * Determines if the user's audio should be blocked 
   * based on the current lock state.
   */
  shouldBlockAudio: (isLocked: boolean) => {
    if (!SessionConfig.enableInterruptionLock) return false;
    return isLocked;
  },
  
  /**
   * Logic to decide if the pressure cooker should be active.
   * If the AI is currently in its "protected" 7s window OR actively speaking,
   * the pressure cooker is paused so the user is only taxed on their own turn.
   */
  isPressureCookerActive: (isLocked: boolean, isAudioPlaying: boolean = false) => {
    if (!SessionConfig.enablePressureCooker) return false;
    // If locked or AI is actively playing audio, it's the agent's turn -> Pressure cooker OFF
    return !isLocked && !isAudioPlaying;
  },

  /**
   * Returns the configured 7-second lock duration in milliseconds.
   */
  getInterruptionLockMs: () => {
    return SessionConfig.interruptionLockMs;
  },

  /**
   * Returns the configured 120-second pressure cooker limit in seconds.
   */
  getMaxPressureDebtSeconds: () => {
    return Math.floor(SessionConfig.pressureCookerMs / 1000);
  },
};