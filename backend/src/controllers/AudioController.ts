import { Request, Response } from "express";
import {
  YoutubeService,
  extractYouTubeId,
} from "../services/YoutubeService";
import { RapidAudioService, AudioExt } from "../services/RapidAudioService";
import DownloadQuotaModel from "../models/downloadQuota";
import { AuthRequest } from "../middleware/auth";

const FREE_DAILY_LIMIT = parseInt(
  process.env.AUDIO_FREE_DAILY_LIMIT || "2",
  10
);
const PRO_MAX_DURATION_SECONDS = parseInt(
  process.env.AUDIO_PRO_MAX_DURATION_SECONDS || "3600",
  10
);
const FREE_MAX_DURATION_SECONDS = parseInt(
  process.env.AUDIO_FREE_MAX_DURATION_SECONDS || "1200",
  10
);

const ALLOWED_EXT: AudioExt[] = ["mp3", "m4a"];

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) {
    return fwd.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function isPro(req: AuthRequest): boolean {
  return !!req.user?.is_pro;
}

export class AudioController {
  private youtubeService = new YoutubeService();
  private rapid = new RapidAudioService();

  status = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        provider: "youtube-mp3-2025",
        enabled: this.rapid.enabled(),
        free_daily_limit: FREE_DAILY_LIMIT,
        free_max_duration_seconds: FREE_MAX_DURATION_SECONDS,
        pro_max_duration_seconds: PRO_MAX_DURATION_SECONDS,
        formats: ALLOWED_EXT,
      },
    });
  };

  info = async (req: Request, res: Response) => {
    const raw =
      (req.body?.url as string) ||
      (req.body?.video_id as string) ||
      (req.query.url as string) ||
      (req.query.video_id as string);
    const id = extractYouTubeId(raw || "");
    if (!id) {
      return res
        .status(400)
        .json({ message: "Provide a valid YouTube URL or video_id." });
    }
    const info = await this.youtubeService.getRichVideoInfo(id);
    if (!info) {
      return res.status(404).json({ message: "Video not found." });
    }
    res.json({ success: true, data: info });
  };

  quota = async (req: AuthRequest, res: Response) => {
    const ip = clientIp(req);
    const deviceId = (req.query.device as string) || undefined;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const filter: any = { createdAt: { $gte: since }, ip };
    if (deviceId) filter.device_id = deviceId;
    const used = await DownloadQuotaModel.countDocuments(filter);
    const pro = isPro(req);
    res.json({
      success: true,
      data: {
        used,
        limit: pro ? null : FREE_DAILY_LIMIT,
        remaining: pro ? null : Math.max(0, FREE_DAILY_LIMIT - used),
        pro,
        free_max_duration_seconds: FREE_MAX_DURATION_SECONDS,
        pro_max_duration_seconds: PRO_MAX_DURATION_SECONDS,
        resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
  };

  download = async (req: AuthRequest, res: Response) => {
    const body = req.body ?? {};
    const raw = body.url || body.video_id;
    const id = extractYouTubeId(raw || "");
    if (!id) {
      return res
        .status(400)
        .json({ message: "Provide a valid YouTube URL or video_id." });
    }
    const ext: AudioExt = ALLOWED_EXT.includes(body.ext) ? body.ext : "mp3";
    const deviceId: string | undefined = body.device_id || undefined;

    if (!this.rapid.enabled()) {
      return res.status(501).json({
        success: false,
        code: "AUDIO_PROVIDER_DISABLED",
        message:
          "Audio provider is not configured on the server. Set RAPIDAPI_MP3_KEY to enable downloads.",
      });
    }

    const meta = await this.youtubeService.getRichVideoInfo(id);
    if (!meta) {
      return res.status(404).json({ message: "Video not found." });
    }
    const pro = isPro(req);
    const ip = clientIp(req);

    if (pro && meta.durationSeconds > PRO_MAX_DURATION_SECONDS) {
      return res.status(413).json({
        success: false,
        code: "AUDIO_TOO_LONG",
        message: `Maximum supported length is ${Math.floor(
          PRO_MAX_DURATION_SECONDS / 60
        )} minutes.`,
      });
    }
    if (!pro && meta.durationSeconds > FREE_MAX_DURATION_SECONDS) {
      return res.status(402).json({
        success: false,
        code: "AUDIO_LENGTH_PRO_ONLY",
        message: `Audio longer than ${Math.floor(
          FREE_MAX_DURATION_SECONDS / 60
        )} minutes is a PRO-only feature.`,
        durationSeconds: meta.durationSeconds,
        proMaxDurationSeconds: PRO_MAX_DURATION_SECONDS,
      });
    }

    if (!pro) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const usageFilter: any = { createdAt: { $gte: since }, ip };
      if (deviceId) usageFilter.device_id = deviceId;
      const used = await DownloadQuotaModel.countDocuments(usageFilter);
      if (used >= FREE_DAILY_LIMIT) {
        return res.status(402).json({
          success: false,
          code: "AUDIO_QUOTA_EXCEEDED",
          message: `Daily limit reached (${FREE_DAILY_LIMIT}/24h). Go PRO for unlimited downloads.`,
          used,
          limit: FREE_DAILY_LIMIT,
        });
      }
    }

    const audio = await this.rapid.getAudio(id, ext);
    if (!audio.linkDownload) {
      return res.status(502).json({
        success: false,
        code: "AUDIO_PROVIDER_FAILED",
        message: "Audio provider returned no download link.",
      });
    }

    DownloadQuotaModel.create({
      ip,
      device_id: deviceId,
      user_id: req.user?._id,
      video_id: id,
      duration_seconds: meta.durationSeconds,
      ext,
      pro,
    }).catch((e) =>
      console.warn("[download-quota] insert failed:", e?.message)
    );

    res.json({
      success: true,
      data: {
        videoId: id,
        title: meta.title,
        channel: meta.channelTitle,
        thumbnail: meta.thumbnail,
        durationSeconds: meta.durationSeconds,
        ext,
        directDownload: true,
        downloadUrl: audio.linkDownload,
        progressUrl: audio.linkDownloadProgress,
        streamUrl: audio.linkStream,
        pro,
      },
    });
  };
}
