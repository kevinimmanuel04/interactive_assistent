/**
 * Edge-TTS Client for Browser / Tauri environments.
 * Synthesizes text into audio bytes using Microsoft Edge TTS endpoint (en-US-AriaNeural).
 */

const EDGE_TTS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EA654982A6DA544703D6DB9E";

export interface EdgeTTSOptions {
  voice?: string;
  rate?: string;
  volume?: string;
  pitch?: string;
}

export async function synthesizeEdgeTTS(
  text: string,
  options: EdgeTTSOptions = {}
): Promise<ArrayBuffer> {
  const voice = options.voice || "en-US-JennyNeural";
  const rate = options.rate || "+0%";
  const volume = options.volume || "+0%";
  const pitch = options.pitch || "+0Hz";

  // Clean text from custom tags like <mood:happy>
  const cleanText = text.replace(/<mood:[^>]+>/g, "").trim();
  if (!cleanText) {
    throw new Error("Empty text provided for Edge TTS synthesis");
  }

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID().replace(/-/g, "");
    let ws: WebSocket;

    try {
      ws = new WebSocket(EDGE_TTS_URL);
    } catch (e) {
      return reject(e);
    }

    const audioChunks: Uint8Array[] = [];
    const timeoutTimer = setTimeout(() => {
      ws.close();
      reject(new Error("Edge TTS synthesis request timed out"));
    }, 12000);

    ws.onopen = () => {
      // 1. Send configuration header with standard Edge TTS audio format
      const configMsg =
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataversion: "A6",
                format: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      ws.send(configMsg);

      // 2. Send SSML payload
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
        `${escapeXml(cleanText)}` +
        `</prosody>` +
        `</voice>` +
        `</speak>`;

      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;

      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event: MessageEvent) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeoutTimer);
          ws.close();
          const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of audioChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(merged.buffer);
        }
      } else if (event.data instanceof Blob) {
        const buffer = await event.data.arrayBuffer();
        const view = new DataView(buffer);
        const headerLength = view.getUint16(0);
        if (buffer.byteLength > headerLength + 2) {
          const audioData = new Uint8Array(buffer.slice(2 + headerLength));
          audioChunks.push(audioData);
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeoutTimer);
      reject(err);
    };
  });
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
