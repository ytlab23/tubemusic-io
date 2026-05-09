import { Request, Response } from "express";
import axios from "axios";
import { YoutubeService, extractYouTubeId } from "../services/YoutubeService";
import { getYouTubeKeyRotator } from "../utils/youtubeKeyRotator";
import CheckerLogModel from "../models/checkerLog";
import { AuthRequest } from "../middleware/auth";

const TUBEPILOT_DEFAULT = "https://tubepilot.ai/wp-json/tubepilot/v1";

function tubePilotConfig() {
  return {
    url: process.env.TUBEPILOT_URL || TUBEPILOT_DEFAULT,
    apiKey: process.env.TUBEPILOT_API_KEY,
  };
}

export class YoutubeController {
  private youtubeService: YoutubeService;

  constructor() {
    this.youtubeService = new YoutubeService();
  }

  checkCopyright = async (req: AuthRequest, res: Response) => {
    try {
      const { youtube_url } = req.body;
      if (!youtube_url) {
        return res
          .status(400)
          .json({ message: "Please provide a YouTube URL." });
      }
      const { url, apiKey } = tubePilotConfig();
      const response = await axios.post(
        `${url}/copyright-check`,
        { youtube_url },
        { headers: apiKey ? { "X-API-Key": apiKey } : undefined }
      );
      const data = response.data;
      const log = await this.logCheck(req, youtube_url, data).catch((e) => {
        console.warn("[checker-log] save failed:", e?.message);
        return null;
      });
      if (log && data && typeof data === "object") {
        if (data.data && typeof data.data === "object") {
          (data.data as any).checker_log_id = log._id;
        } else {
          (data as any).checker_log_id = log._id;
        }
      }
      res.status(200).json(data);
    } catch (error: any) {
      console.error(
        "Error checking copyright:",
        error.response?.data || error.message
      );
      res.status(error.response?.status || 500).json({
        message:
          error.response?.data?.message ||
          "An error occurred while checking copyright.",
      });
    }
  };

  private async logCheck(
    req: AuthRequest,
    youtube_url: string,
    data: any
  ): Promise<any> {
    const videoId = extractYouTubeId(youtube_url);
    if (!videoId) return null;
    const track = data?.data?.track || data?.track;
    const log = {
      video_id: videoId,
      url: youtube_url,
      title: track?.name || track?.title,
      channel: track?.author || track?.channel,
      thumbnail: track?.thumbnail,
      duration_seconds:
        typeof track?.duration === "number" ? track.duration : undefined,
      views: track?.views,
      copyright_free: !!(data?.data?.copyright_free ?? data?.copyright_free),
      found_in_library: !!(
        data?.data?.found_in_library ?? data?.found_in_library
      ),
      score: data?.data?.score ?? data?.score,
      source: "tubepilot" as const,
      raw: data,
      user_id: req.user?._id,
      ip:
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip,
      user_agent: req.get("user-agent") || undefined,
    };
    return await CheckerLogModel.create(log);
  }

  listChecks = async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const page = Math.max(parseInt(String(req.query.page ?? "1"), 10), 1);
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (req.query.video_id) filter.video_id = req.query.video_id;
    if (req.query.flagged === "true") filter.flagged = true;
    const [items, total] = await Promise.all([
      CheckerLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      CheckerLogModel.countDocuments(filter),
    ]);
    res.json({ success: true, data: items, total, page, limit });
  };

  flagCheck = async (req: Request, res: Response) => {
    const id = req.params.id;
    const { reason } = req.body || {};
    const updated = await CheckerLogModel.findByIdAndUpdate(
      id,
      { flagged: true, flag_reason: reason || "user-flagged" },
      { new: true }
    )
      .lean()
      .exec();
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json({ success: true, data: updated });
  };

  searchMusic = async (req: Request, res: Response) => {
    try {
      const {
        query = "",
        genre = "",
        mood = "",
        channels = [],
        page = 1,
        per_page = 10,
        sort = "recent",
        upload_date,
        min_views,
        max_views,
      } = req.body ?? {};
      const { url, apiKey } = tubePilotConfig();
      const response = await axios.post(
        `${url}/search`,
        {
          query,
          genre,
          mood,
          channels,
          page,
          per_page,
          sort,
          upload_date,
          min_views,
          max_views,
        },
        { headers: apiKey ? { "X-API-Key": apiKey } : undefined }
      );
      res.status(200).json(response.data);
    } catch (error: any) {
      console.error(
        "Error searching music:",
        error.response?.data || error.message
      );
      res.status(error.response?.status || 500).json({
        message:
          error.response?.data?.message ||
          "An error occurred while searching music.",
      });
    }
  };

  getGenres = async (_req: Request, res: Response) => {
    try {
      const { url, apiKey } = tubePilotConfig();
      const response = await axios.get(`${url}/genres`, {
        headers: apiKey ? { "X-API-Key": apiKey } : undefined,
      });
      res.status(200).json(response.data);
    } catch (error: any) {
      console.error(
        "Error fetching genres:",
        error.response?.data || error.message
      );
      res.status(error.response?.status || 500).json({
        message:
          error.response?.data?.message ||
          "An error occurred while fetching genres.",
      });
    }
  };

  getMoods = async (_req: Request, res: Response) => {
    try {
      const { url, apiKey } = tubePilotConfig();
      const response = await axios.get(`${url}/moods`, {
        headers: apiKey ? { "X-API-Key": apiKey } : undefined,
      });
      res.status(200).json(response.data);
    } catch (error: any) {
      console.error(
        "Error fetching moods:",
        error.response?.data || error.message
      );
      res.status(error.response?.status || 500).json({
        message:
          error.response?.data?.message ||
          "An error occurred while fetching moods.",
      });
    }
  };

  getChannels = async (_req: Request, res: Response) => {
    try {
      const { url, apiKey } = tubePilotConfig();
      const response = await axios.get(`${url}/channels`, {
        headers: apiKey ? { "X-API-Key": apiKey } : undefined,
      });
      res.status(200).json(response.data);
    } catch (error: any) {
      console.error(
        "Error fetching channels:",
        error.response?.data || error.message
      );
      res.status(error.response?.status || 500).json({
        message:
          error.response?.data?.message ||
          "An error occurred while fetching channels.",
      });
    }
  };

  videoInfo = async (req: Request, res: Response) => {
    const raw =
      (req.query.video_id as string) ||
      (req.query.url as string) ||
      (req.body?.video_id as string) ||
      (req.body?.url as string);
    const videoId = extractYouTubeId(raw || "");
    if (!videoId) {
      return res.status(400).json({
        message: "Provide video_id or url as a valid YouTube reference.",
      });
    }
    try {
      const info = await this.youtubeService.getRichVideoInfo(videoId);
      if (!info) {
        return res
          .status(404)
          .json({ message: "Video not found or unavailable." });
      }
      res.status(200).json({ success: true, data: info });
    } catch (error: any) {
      console.error(
        "Error fetching video info:",
        error.response?.data || error.message
      );
      res.status(error.response?.status || 500).json({
        message:
          error.response?.data?.error?.message ||
          error.message ||
          "An error occurred while fetching video info.",
      });
    }
  };

  keysStatus = async (_req: Request, res: Response) => {
    try {
      const status = getYouTubeKeyRotator().status();
      res.status(200).json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
