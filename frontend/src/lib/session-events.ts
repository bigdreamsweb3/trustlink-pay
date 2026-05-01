import { apiPost } from "@/src/lib/api";
import { buildBackendUrl } from "@/src/lib/backend";

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
    private onConnectionChange?: (connected: boolean) => void,
  ) {
    this.isListening = false;
    this.fallbackAttempts = 0;
    this.maxFallbackAttempts = 6; // 1 minute of fallback polling
  }

  start() {
    if (this.isListening) return;
    this.isListening = true;
    this.fallbackAttempts = 0;

    // Start immediate polling as backup while SSE connects
    this.startImmediatePolling();

    // Try to connect to Server-Sent Events
    this.connectToEvents();
  }

  private connectToEvents(retryCount = 0) {
    try {
      // EventSource doesn't work through middleware proxy, use direct backend URL
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";
      const eventsUrl = `${backendUrl}/api/auth/session/events?sessionId=${this.sessionId}`;

      this.eventSource = new EventSource(eventsUrl);

      this.eventSource.onopen = () => {
        this.onConnectionChange?.(true);

        // Stop immediate polling when SSE connects successfully
        this.stopFallbackPolling();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "verified") {
            this.stop();
            this.onVerification(data);
          }
        } catch (error) {
          // Silent error handling for malformed messages
        }
      };

      this.eventSource.onerror = (error) => {
        this.onConnectionChange?.(false);

        // Retry connection if it failed and we haven't exceeded retry limit
        if (
          retryCount < 3 &&
          this.eventSource?.readyState !== EventSource.OPEN
        ) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s

          setTimeout(() => {
            this.connectToEvents(retryCount + 1);
          }, delay);
          return;
        }

        // Start fallback polling if SSE fails after retries
        if (this.fallbackAttempts < this.maxFallbackAttempts) {
          this.startFallbackPolling();
        } else {
          this.onError?.("Connection failed after multiple attempts");
        }
      };
    } catch (error) {
      // Fallback to polling immediately
      this.startFallbackPolling();
    }
  }

  private startFallbackPolling() {
    if (this.fallbackPollingInterval) {
      return;
    }

    this.fallbackAttempts++;

    this.fallbackPollingInterval = setInterval(async () => {
      try {
        const result = await apiPost<SessionVerificationResult>(
          "/api/auth/session/verify",
          {
            sessionId: this.sessionId,
            sessionCode: this.sessionCode,
          },
        );

        if (result.success) {
          this.stop();
          this.onVerification(result);
        } else if (result.error && this.shouldStopPolling(result.error)) {
          this.stop();
          if (this.onError) {
            this.onError(result.error);
          }
        }
      } catch (error) {
        // Silent error handling for polling failures
      }
    }, 10000); // 10 seconds
  }

  private startImmediatePolling() {
    // Poll immediately, then every 2 seconds for ultra-fast verification
    const pollImmediately = async () => {
      if (!this.isListening) {
        return;
      }

      try {
        const result = await this.checkVerificationStatus();

        if (result.success) {
          this.stop();
          this.onVerification(result);
          return;
        } else if (
          result.error &&
          result.error !== "Session not yet verified"
        ) {
          // Don't stop on "Session not yet verified" - keep polling
        }
      } catch (error) {
        // Silent error handling for immediate polling
      }

      // Schedule next poll if still listening
      if (this.isListening) {
        setTimeout(pollImmediately, 2000); // 2 seconds
      }
    };

    // Start polling immediately
    pollImmediately();
  }

  private stopFallbackPolling() {
    if (this.fallbackPollingInterval) {
      clearInterval(this.fallbackPollingInterval);
      this.fallbackPollingInterval = null;
    }
  }

  private async checkVerificationStatus(): Promise<SessionVerificationResult> {
    try {
      const result = await apiPost<SessionVerificationResult>(
        "/api/auth/session/verify",
        {
          sessionId: this.sessionId,
          sessionCode: this.sessionCode,
        },
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: "Failed to check verification status",
        stage: "pin_setup",
      };
    }
  }

  private shouldStopPolling(error?: string): boolean {
    if (!error) return false;

    const stopErrors = [
      "Invalid or expired session code",
      "Session mismatch",
      "User not found",
      "Session verification incomplete",
    ];

    return stopErrors.some((stopError) => error.includes(stopError));
  }

  stop() {
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
