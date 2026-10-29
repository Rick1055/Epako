import { session } from "./supabase";

export type Telemetry = {
  rms: number;
  is_speaking: boolean;
  buffer_len: number;
};

export type RectifiedOutput = {
  raw_text: string;
  repaired_text: string;
  audio_base64: string | null;
  voice_error: string | null;
  latency_ms: number;
};

export type NoSpeechInfo = {
  reason?: string;
  message?: string;
};

export type ConversationHandler = {
  onOpen?: () => void;
  onTelemetry?: (telemetry: Telemetry) => void;
  onRectified?: (output: RectifiedOutput) => void;
  onNoSpeech?: (info: NoSpeechInfo) => void;
  onError?: (err: string) => void;
  onClose?: () => void;
};

export class ConversationSocket {
  private ws: WebSocket | null = null;
  private pingTimer: number | undefined;

  constructor(private handler: ConversationHandler) {}

  async connect(): Promise<void> {
    const s = await session();
    if (!s?.access_token) throw new Error("Please sign in again.");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws/rectify`;

    return new Promise((resolve, reject) => {
      let authed = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        // Send initial auth message as required by the rectify WebSocket contract
        ws.send(
          JSON.stringify({
            type: "auth",
            token: s.access_token,
            sample_rate: 16000,
            encoding: "pcm_s16le",
          }),
        );
        // Ping immediately to verify server-side auth verification
        ws.send(JSON.stringify({ type: "ping" }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "pong") {
            if (!authed) {
              authed = true;
              this.handler.onOpen?.();
              resolve();
            }
            return;
          }

          if (msg.type === "telemetry") {
            this.handler.onTelemetry?.(msg);
          } else if (msg.type === "rectified_output") {
            this.handler.onRectified?.(msg);
          } else if (msg.type === "no_speech") {
            this.handler.onNoSpeech?.(msg);
          } else if (msg.type === "error") {
            this.handler.onError?.(msg.detail ?? "Streaming error");
          }
        } catch {
          // Ignore unparseable or binary frames
        }
      };

      ws.onerror = () => {
        if (!authed) reject(new Error("Could not connect to live speech service."));
        else this.handler.onError?.("Connection error with live speech service.");
      };

      ws.onclose = (ev) => {
        clearInterval(this.pingTimer);
        if (!authed) {
          reject(new Error(ev.code === 1008 ? "Session authentication rejected. Please sign in again." : "Speech stream closed."));
        }
        this.handler.onClose?.();
      };

      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 10000);
    });
  }

  sendAudio(chunk: Int16Array) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(chunk.buffer);
    }
  }

  close() {
    clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

