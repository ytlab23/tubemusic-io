import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import {
  YoutubeService,
  extractYouTubeId,
} from "../services/YoutubeService";
import { LyriaService, LyriaModel } from "../services/LyriaService";
import {
  BuilderInput,
  buildCatalogue,
  buildPrompt,
  findGenre,
  ARTIST_STYLES,
} from "../services/promptBuilder";

const aiMusicEnabled = (): boolean =>
  !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

const SUPPORTED_LANGUAGES = [
  "english",
  "spanish",
  "french",
  "italian",
  "german",
  "portuguese",
  "japanese",
  "korean",
  "instrumental",
];

const SUPPORTED_MODES = [
  "prompt",
  "lyrics",
  "image",
  "music_video",
  "builder",
] as const;
type Mode = (typeof SUPPORTED_MODES)[number];

export class AIMusicController {
  private youtubeService = new YoutubeService();
  private lyria = new LyriaService();

  status = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        enabled: aiMusicEnabled(),
        model: "lyria-3-clip-preview",
        models: [
          {
            slug: "lyria-3-clip-preview",
            label: "Standard",
            description:
              "30-second clip. Fast, free for the first generation.",
          },
          {
            slug: "lyria-3-pro-preview",
            label: "Pro (max quality)",
            description:
              "Higher-fidelity 30-second clip. PRO subscribers only.",
            proOnly: true,
          },
        ],
        modes: SUPPORTED_MODES.slice(),
        free_generations_per_user: 1,
        pro_generations_per_month: 10,
        max_duration_seconds: 30,
        languages: SUPPORTED_LANGUAGES,
      },
    });
  };

  catalogue = async (_req: Request, res: Response) => {
    res.json({ success: true, data: buildCatalogue() });
  };

  promptFromVideo = async (req: Request, res: Response) => {
    const raw =
      (req.query.url as string) ||
      (req.query.video_id as string) ||
      (req.body?.url as string) ||
      (req.body?.video_id as string);
    const id = extractYouTubeId(raw || "");
    if (!id) {
      return res.status(400).json({
        message: "Provide url or video_id (must be a valid YouTube reference).",
      });
    }
    const info = await this.youtubeService.getRichVideoInfo(id);
    if (!info) {
      return res.status(404).json({ message: "Video not found." });
    }
    const moodHints = (info.tags || []).slice(0, 6).join(", ") || "ambient";
    const lengthHint =
      info.durationSeconds < 90
        ? "short, punchy"
        : info.durationSeconds < 240
        ? "mid-length, flowing"
        : "long-form, evolving";
    const prompt = [
      `Compose a ${lengthHint} instrumental track inspired by the YouTube video`,
      `"${info.title}" by ${info.channelTitle}.`,
      `It should match the visual mood and pacing of the original.`,
      `Vibes: ${moodHints}.`,
      `Avoid lyrics. Aim for under 30 seconds.`,
    ].join(" ");
    res.json({
      success: true,
      data: {
        videoId: info.videoId,
        title: info.title,
        channel: info.channelTitle,
        durationSeconds: info.durationSeconds,
        tags: info.tags,
        thumbnail: info.thumbnail,
        derivedPrompt: prompt,
      },
    });
  };

  generate = async (req: AuthRequest, res: Response) => {
    if (!aiMusicEnabled()) {
      return res.status(501).json({
        success: false,
        code: "AI_MUSIC_DISABLED",
        message:
          "AI music generation is not configured on the server. Set GEMINI_API_KEY to enable.",
      });
    }
    const body = req.body ?? {};
    const mode = body.mode as Mode | undefined;
    if (!mode || !SUPPORTED_MODES.includes(mode)) {
      return res.status(400).json({
        message: `mode is required, must be one of ${SUPPORTED_MODES.join(", ")}`,
      });
    }
    let prompt = "";
    try {
      prompt = await this.buildPrompt(mode, body);
    } catch (e: any) {
      return res.status(400).json({ message: e?.message ?? String(e) });
    }
    if (!prompt) {
      return res.status(400).json({ message: "Could not build a prompt from this input." });
    }
    // Model selection. Pro is gated to PRO subscribers; everyone else falls
    // back to Standard with a soft note.
    let model: LyriaModel = "lyria-3-clip-preview";
    let proRequested = false;
    if (body.model === "lyria-3-pro-preview") {
      proRequested = true;
      const isPro = !!req.user?.is_pro;
      if (isPro) {
        model = "lyria-3-pro-preview";
      }
    }

    try {
      const result = await this.lyria.generate({ prompt, model });
      const durationHint =
        typeof body.durationSeconds === "number" ? body.durationSeconds : 30;
      res.json({
        success: true,
        code: "GENERATED",
        data: {
          mode,
          prompt: result.promptUsed,
          caption: result.caption ?? null,
          mimeType: result.mimeType,
          audioBase64: result.audioBase64,
          dataUrl: `data:${result.mimeType};base64,${result.audioBase64}`,
          bytes: result.bytes,
          durationHintSeconds: durationHint,
          model: result.model,
          proModelRequested: proRequested,
          proModelUsed: result.model === "lyria-3-pro-preview",
          userId: req.user?._id,
        },
      });
    } catch (e: any) {
      console.error(
        "[ai-music] Lyria failed:",
        e?.response?.data || e?.message || e
      );
      const code = e?.lyriaCode;
      if (code === "PROHIBITED_CONTENT" || code === "PROMPT_BLOCKED") {
        return res.status(422).json({
          success: false,
          code,
          message:
            e?.message ||
            "Lyria's safety filter blocked this prompt. Try removing artist names or describing the style instead.",
        });
      }
      const status = e?.response?.status ?? 502;
      res.status(status).json({
        success: false,
        code: "AI_MUSIC_GENERATION_FAILED",
        message:
          e?.response?.data?.error?.message ||
          e?.message ||
          "Lyria generation failed. Please try again.",
      });
    }
  };

  /**
   * Convenience: build the prompt server-side without calling Lyria.
   * Lets the frontend show a live preview of what will be sent so users can
   * sanity-check before spending a generation.
   */
  previewPrompt = async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const mode = (body.mode as Mode) || "builder";
    if (!SUPPORTED_MODES.includes(mode)) {
      return res
        .status(400)
        .json({ message: `mode must be one of ${SUPPORTED_MODES.join(", ")}` });
    }
    try {
      const prompt = await this.buildPrompt(mode, body);
      res.json({ success: true, data: { mode, prompt } });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? String(e) });
    }
  };

  private async buildPrompt(mode: Mode, body: any): Promise<string> {
    const lang: string = (body.language || "instrumental").trim().toLowerCase();
    const lengthSeconds: number = Math.min(
      Math.max(parseInt(String(body.durationSeconds ?? 30), 10) || 30, 5),
      30
    );
    switch (mode) {
      case "prompt": {
        const p = String(body.prompt || "").trim();
        if (!p) throw new Error("Prompt mode requires a non-empty prompt.");
        return this.shapePrompt(p, lang, lengthSeconds);
      }
      case "lyrics": {
        const l = String(body.lyrics || "").trim();
        if (!l) throw new Error("Lyrics mode requires lyrics.");
        const langClause =
          lang === "instrumental"
            ? "Treat the lyrics as a vibe guide; render as instrumental."
            : `Vocals in ${lang}.`;
        return this.shapePrompt(
          `Compose a track that fits these lyrics:\n\n${l}\n\n${langClause}`,
          lang,
          lengthSeconds
        );
      }
      case "image": {
        const url = String(body.imageUrl || "").trim();
        if (!url) throw new Error("Image mode requires imageUrl.");
        return this.shapePrompt(
          `Compose a track that captures the mood, palette, and pacing of this image: ${url}. Pick instruments that match the image’s atmosphere.`,
          lang,
          lengthSeconds
        );
      }
      case "music_video": {
        const raw = String(body.videoId || body.videoUrl || body.url || "").trim();
        const id = extractYouTubeId(raw);
        if (!id) throw new Error("Music-video mode requires a YouTube videoId or URL.");
        const info = await this.youtubeService.getRichVideoInfo(id);
        if (!info) throw new Error("YouTube video not found.");
        const moodHints =
          (info.tags || []).slice(0, 6).join(", ") || "ambient, cinematic";
        const base = [
          `Compose an original instrumental track inspired by the YouTube video`,
          `"${info.title}" by ${info.channelTitle}.`,
          `Match the mood, pacing, and palette of the original.`,
          `Vibes: ${moodHints}.`,
        ].join(" ");
        return this.shapePrompt(base, lang, lengthSeconds);
      }
      case "builder": {
        const builder: BuilderInput = {
          genre: body.genre,
          mood: body.mood,
          energy: body.energy,
          bpm: typeof body.bpm === "number" ? body.bpm : undefined,
          era: body.era,
          vocals: body.vocals,
          language: body.language,
          instruments: Array.isArray(body.instruments)
            ? body.instruments
            : undefined,
          inspiredBy: body.inspiredBy,
          customNotes: body.customNotes,
          durationSeconds: lengthSeconds,
          appendUniqueSuffix: body.appendUniqueSuffix !== false,
        };
        if (
          !builder.genre &&
          !builder.mood &&
          !builder.inspiredBy &&
          !builder.customNotes
        ) {
          throw new Error(
            "Builder mode needs at least a genre, mood, inspiration, or custom notes."
          );
        }
        return buildPrompt(builder);
      }
    }
  }

  private shapePrompt(seed: string, lang: string, seconds: number): string {
    const langClause =
      lang === "instrumental"
        ? "Instrumental only — no lyrics."
        : `Optional vocals in ${lang}.`;
    return `${seed}\n\n${langClause} Aim for under ${seconds} seconds. Royalty-free style suitable for YouTube content.`;
  }
}
