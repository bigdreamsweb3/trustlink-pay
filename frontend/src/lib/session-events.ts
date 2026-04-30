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
 * Real-time session verification using Server-Sent Events
 */
export class SessionEventManager {
  private eventSource: EventSource | null = null;
  private isListening = false;
  private fallbackPollingInterval: NodeJS.Timeout | null = null;
  private fallbackAttempts = 0;
  private maxFallbackAttempts = 6; // 1 minute of fallback polling

  constructor(
    private sessionId: string,
    private sessionCode: string,
    private onVerification: (result: SessionVerificationResult) => void,
    private onError?: (error: string) => void,
    private onConnectionChange?: (connected: boolean) => void
  ) {}

  start() {
    if (this.isListening) {
      return;
    }

    this.isListening = true;
    this.fallbackAttempts = 0;

    console.log(`[SessionEvents] Starting real-time listening for session ${this.sessionId}`);

    // Try to connect to Server-Sent Events
    this.connectToEvents();
  }

  private connectToEvents() {
    try {
      const eventsUrl = `/backend/api/auth/session/events?sessionId=${this.sessionId}`;
      this.eventSource = new EventSource(eventsUrl);

      this.eventSource.onopen = () => {
        console.log(`[SessionEvents] Connected to real-time events`);
        this.onConnectionChange?.(true);
        
        // Stop fallback polling if it was running
        this.stopFallbackPolling();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`[SessionEvents] Received event:`, data);

          if (data.type === "verified") {
            console.log(`[SessionEvents] Verification received via real-time events`);
            this.stop();
            this.onVerification(data);
          }
        } catch (error) {
          console.error(`[SessionEvents] Failed to parse event:`, error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error(`[SessionEvents] EventSource error:`, error);
        console.error(`[SessionEvents] URL attempted:`, eventsUrl);
        console.error(`[SessionEvents] ReadyState:`, this.eventSource?.readyState);
        this.onConnectionChange?.(false);
        
        // Start fallback polling if SSE fails
        if (this.fallbackAttempts < this.maxFallbackAttempts) {
          this.startFallbackPolling();
        } else {
          this.stop();
          if (this.onError) {
            this.onError("Real-time connection failed. Please refresh and try again.");
          }
        }
      };

    } catch (error) {
      console.error(`[SessionEvents] Failed to create EventSource:`, error);
      // Fallback to polling immediately
      this.startFallbackPolling();
    }
  }

  private startFallbackPolling() {
    if (this.fallbackPollingInterval) {
      return;
    }

    console.log(`[SessionEvents] Starting fallback polling attempt ${this.fallbackAttempts + 1}`);
    this.fallbackAttempts++;

    this.fallbackPollingInterval = setInterval(async () => {
      try {
        const result = await apiPost<SessionVerificationResult>("/api/auth/session/verify", {
          sessionId: this.sessionId,
          sessionCode: this.sessionCode,
        });

        if (result.success) {
          console.log(`[SessionEvents] Verification successful via fallback polling`);
          this.stop();
          this.onVerification(result);
        } else if (result.error && this.shouldStopPolling(result.error)) {
          this.stop();
          if (this.onError) {
            this.onError(result.error);
          }
        }
      } catch (error) {
        console.error(`[SessionEvents] Fallback polling error:`, error);
      }
    }, 10000); // 10 seconds
  }

  private stopFallbackPolling() {
    if (this.fallbackPollingInterval) {
      clearInterval(this.fallbackPollingInterval);
      this.fallbackPollingInterval = null;
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

  stop() {
    console.log(`[SessionEvents] Stopping session event manager`);
    
    this.isListening = false;
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.stopFallbackPolling();
  }

  isActive(): boolean {
    return this.isListening;
  }
}
