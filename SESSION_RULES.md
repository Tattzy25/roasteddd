# Session Logic & Interaction Rules
**Project:** FaceTime AI Roast
**Status:** Production / Live

This document defines the a-priori logic governing the interaction between the User and the AI Agent to ensure a high-intensity roasting experience and protect the "Pay and Play" revenue model.

## 1. The Interruption Lock (The "Roast Protection")
To prevent users from cutting off the agent during critical roast deliveries, a non-interruptible window is enforced.

- **Trigger:** Activated the millisecond the AI Agent begins sending audio data.
- **Duration:** 7,000ms (7 seconds).
- **Enforcement:** 
    - The `isLockedRef` is set to `true`.
    - The `sessionManager.shouldBlockAudio` gate returns `true`.
    - All incoming user audio packets are dropped at the hook level before reaching the server.
- **Result:** The Agent is guaranteed a minimum of 7 seconds of uninterrupted speaking time.

## 2. The Pressure Cooker (The "Rollover Debt")
A cumulative silence tracking system that penalizes hesitation and rewards fluency.

- **Logic Type:** Rollover Accumulation (Silence = Debt / Speaking = Payment).
- **Active Window:** Only active when `sessionManager.isPressureCookerActive` is `true` (i.e., when the 7s Interruption Lock is OFF).
- **The Debt Cycle:**
    - **Dead Silence:** Every 1 second of silence adds **+1** to the `pressureDebt` gauge.
    - **Active Speaking:** Every 1 second of detected speech subtracts **-1** from the `pressureDebt` gauge.
    - **Floor:** The debt cannot drop below **0**.
- **The "Smoke" Point:**
    - If `pressureDebt` reaches **120**, the session is immediately terminated.
    - **Action:** `disconnect()` is called $\rightarrow$ Session closed $\rightarrow$ User returned to main page to purchase more minutes.

## 3. State Priority Matrix
The system handles conflicting states with the following priority:

| State | Interruption Lock | Pressure Cooker | Audio Flow |
| :--- | :--- | :--- | :--- |
| **AI Starting Roast** | ACTIVE | INACTIVE | BLOCKED |
| **AI Speaking (Post 7s)** | INACTIVE | ACTIVE | OPEN |
| **User Speaking** | INACTIVE | ACTIVE (Draining) | OPEN |
| **User Silent** | INACTIVE | ACTIVE (Filling) | OPEN |
| **Debt = 120** | N/A | N/A | TERMINATED |

## 4. Technical Guardrails
- **Zero Fallbacks:** The logic is implemented as a hard gate in `useGeminiLive.ts`.
- **Sync Precision:** All locks and timers use `useRef` for synchronous updates to prevent state-lag during live audio streaming.
- **Revenue Integrity:** The la-pay-and-play cycle is protected by ensuring the "Smoke Point" is an absolute trigger.
