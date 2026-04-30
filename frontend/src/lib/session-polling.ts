import { apiPost } from "@/src/lib/api";

export interface SessionVerificationResult {
  success: boolean;
  challengeToken?: string;
  user?: {
    id: string;
    displayName: string;
    phoneNumber: string;
  };
  stage: "pin_verify" | "pin_setup";
  error?: string;
}

/**
 * Poll for session verification status
 */
export async function pollSessionVerification(
  sessionId: string,
  sessionCode: string
): Promise<SessionVerificationResult> {
  try {
    const result = await apiPost<SessionVerificationResult>("/api/auth/session/verify", {
      sessionId,
      sessionCode,
    });

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Verification failed",
      stage: "pin_setup",
    };
  }
}

/**
 * Create a polling controller for session verification
 */
export class SessionPollingController {
  private intervalId: NodeJS.Timeout | null = null;
  private isPolling = false;
  private maxAttempts = 30; // 5 minutes with 10-second intervals
  private currentAttempt = 0;
  private currentIntervalMs: number;
  private consecutiveErrors = 0;

  constructor(
    private sessionId: string,
    private sessionCode: string,
    private onVerification: (result: SessionVerificationResult) => void,
    private onError?: (error: string) => void,
    private baseIntervalMs: number = 10000 // Start with 10 seconds
  ) {
    this.currentIntervalMs = baseIntervalMs;
  }

  start() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    this.currentAttempt = 0;
    this.consecutiveErrors = 0;
    this.currentIntervalMs = this.baseIntervalMs;

    console.log(`[SessionPolling] Starting polling for session ${this.sessionId}`);

    this.intervalId = setInterval(() => {
      this.poll();
    }, this.currentIntervalMs);

    // Initial poll
    this.poll();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isPolling = false;
    console.log(`[SessionPolling] Stopped polling for session ${this.sessionId}`);
  }

  private async poll() {
    if (!this.isPolling || this.currentAttempt >= this.maxAttempts) {
      this.stop();
      if (this.currentAttempt >= this.maxAttempts && this.onError) {
        this.onError("Session verification timed out");
      }
      return;
    }

    this.currentAttempt++;

    try {
      console.log(`[SessionPolling] Poll attempt ${this.currentAttempt}/${this.maxAttempts}`);
      const result = await pollSessionVerification(this.sessionId, this.sessionCode);
      
      // Reset consecutive errors on successful request
      this.consecutiveErrors = 0;
      
      if (result.success) {
        console.log(`[SessionPolling] Verification successful!`);
        this.stop();
        this.onVerification(result);
      } else {
        // Check if this is a permanent error that should stop polling
        if (this.shouldStopPolling(result.error)) {
          console.log(`[SessionPolling] Stopping due to permanent error: ${result.error}`);
          this.stop();
          if (this.onError) {
            this.onError(result.error || "Verification failed");
          }
        } else {
          // Continue polling for temporary errors
          console.log(`[SessionPolling] Temporary error, continuing: ${result.error}`);
        }
      }
    } catch (error) {
      this.consecutiveErrors++;
      console.log(`[SessionPolling] Poll error ${this.consecutiveErrors}: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      // Stop after 3 consecutive errors
      if (this.consecutiveErrors >= 3) {
        this.stop();
        if (this.onError) {
          this.onError("Connection failed. Please check your internet and try again.");
        }
      } else {
        // Exponential backoff for errors
        this.adjustPollingInterval();
      }
    }
  }

  private shouldStopPolling(error?: string): boolean {
    if (!error) return false;
    
    const stopErrors = [
      "Invalid or expired session code",
      "Session mismatch", 
      "User not found",
      "Session verification incomplete"
    ];
    
    return stopErrors.some(stopError => error.includes(stopError));
  }

  private adjustPollingInterval() {
    // Exponential backoff: increase interval after errors
    this.currentIntervalMs = Math.min(this.currentIntervalMs * 1.5, 30000); // Max 30 seconds
    
    // Restart interval with new timing
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        this.poll();
      }, this.currentIntervalMs);
    }
  }

  isActive(): boolean {
    return this.isPolling;
  }

  getRemainingAttempts(): number {
    return Math.max(0, this.maxAttempts - this.currentAttempt);
  }
}
