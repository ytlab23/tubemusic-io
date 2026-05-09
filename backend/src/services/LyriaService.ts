import axios from "axios";

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type LyriaModel =
  | "lyria-3-clip-preview"
  | "lyria-3-pro-preview";

export interface LyriaGenerationResult {
  mimeType: string;
  /** Base64 audio payload returned by Gemini */
  audioBase64: string;
  caption?: string;
  promptUsed: string;
  bytes: number;
  model: LyriaModel;
}

const DEFAULT_MODEL: LyriaModel = "lyria-3-clip-preview";

export class LyriaService {
  enabled(): boolean {
    return !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;
  }

  async generate(opts: {
    prompt: string;
    model?: LyriaModel;
  }): Promise<LyriaGenerationResult> {
    if (!this.enabled()) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const model: LyriaModel = opts.model ?? DEFAULT_MODEL;
    const prompt = (opts.prompt || "").trim();
    if (!prompt) {
      throw new Error("Lyria prompt cannot be empty.");
    }

    // Retry-once on transient `OTHER` finishReason — confirmed flaky in
    // production; the second call almost always succeeds. Block reasons
    // (PROHIBITED_CONTENT, etc.) propagate immediately so the caller can
    // adjust the prompt instead of retrying.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.callOnce(prompt, model);
        if (attempt > 0) {
          console.log(
            `[lyria] succeeded on retry attempt ${attempt + 1} (model=${model})`
          );
        }
        return result;
      } catch (err: any) {
        const code = err?.lyriaCode;
        if (code === "PROHIBITED_CONTENT" || code === "PROMPT_BLOCKED") {
          throw err;
        }
        lastErr = err;
        console.warn(
          `[lyria] attempt ${attempt + 1} failed (code=${code}): ${err?.message}`
        );
      }
    }
    throw lastErr ?? new Error("Lyria generation failed");
  }

  private async callOnce(
    prompt: string,
    model: LyriaModel
  ): Promise<LyriaGenerationResult> {
    const url = `${ENDPOINT}/${model}:generateContent`;
    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      },
      {
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 180000,
      }
    );

    const data = response.data;
    const promptFeedback = data?.promptFeedback;
    if (promptFeedback?.blockReason) {
      const e: any = new Error(
        `Prompt blocked by safety filter: ${promptFeedback.blockReason}. ` +
          `Tip: avoid naming real artists or copyrighted songs — describe the style instead.`
      );
      e.lyriaCode =
        promptFeedback.blockReason === "PROHIBITED_CONTENT"
          ? "PROHIBITED_CONTENT"
          : "PROMPT_BLOCKED";
      throw e;
    }

    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const parts = candidate?.content?.parts ?? [];
    let inline: { mimeType: string; data: string } | undefined;
    let caption: string | undefined;
    for (const p of parts) {
      if (p?.inlineData?.data) inline = p.inlineData;
      else if (typeof p?.text === "string") {
        const t: string = p.text;
        if (t.toLowerCase().startsWith("caption:"))
          caption = t.replace(/^caption:\s*/i, "");
      }
    }
    if (!inline) {
      const e: any = new Error(
        `Lyria returned no audio payload (finishReason=${finishReason || "?"})`
      );
      e.lyriaCode =
        finishReason === "SAFETY" || finishReason === "RECITATION"
          ? "PROMPT_BLOCKED"
          : "TRANSIENT";
      throw e;
    }
    const bytes = Math.floor((inline.data.length * 3) / 4);
    return {
      mimeType: inline.mimeType || "audio/mpeg",
      audioBase64: inline.data,
      caption,
      promptUsed: prompt,
      bytes,
      model,
    };
  }
}
