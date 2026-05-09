import { getYouTubeKeyRotator } from "../utils/youtubeKeyRotator";

const BASE_URL = "https://www.googleapis.com/youtube/v3";

export interface BasicVideoInfo {
  videoId: string;
  license: boolean;
  tags: string[];
  url: string;
  title: string;
  thumbnail: string;
  relatedVideos: any[];
}

export interface RichVideoInfo {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  thumbnails: Record<string, { url: string; width: number; height: number }>;
  tags: string[];
  categoryId: string;
  defaultAudioLanguage?: string;
  duration: string;
  durationSeconds: number;
  licensedContent: boolean;
  embeddable: boolean;
  privacyStatus?: string;
  madeForKids?: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  url: string;
  embedUrl: string;
}

const ISO_DURATION = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

function parseIsoDurationSeconds(iso: string): number {
  if (!iso) return 0;
  const m = ISO_DURATION.exec(iso);
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return (
    (Number(d) || 0) * 86400 +
    (Number(h) || 0) * 3600 +
    (Number(mi) || 0) * 60 +
    (Number(s) || 0)
  );
}

function pickThumbnail(thumbs: any): string {
  if (!thumbs) return "";
  return (
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    thumbs.default?.url ||
    ""
  );
}

export class YoutubeService {
  async getVideoLicense(videoId: string): Promise<BasicVideoInfo | undefined> {
    const rotator = getYouTubeKeyRotator();
    const response = await rotator.request<any>(`${BASE_URL}/videos`, {
      method: "GET",
      params: { part: "snippet,contentDetails", id: videoId },
    });
    const data = response.data;
    if (!data?.items?.length) return undefined;
    const video = data.items[0];
    const license = !!video.contentDetails?.licensedContent;
    const tags: string[] = video.snippet?.tags || [];
    const thumbnail = pickThumbnail(video.snippet?.thumbnails);
    const title = video.snippet?.title ?? "";
    return {
      videoId,
      license,
      tags,
      url: `https://youtube.com/embed/${videoId}`,
      title,
      thumbnail,
      relatedVideos: [],
    };
  }

  async getRichVideoInfo(videoId: string): Promise<RichVideoInfo | null> {
    const rotator = getYouTubeKeyRotator();
    const response = await rotator.request<any>(`${BASE_URL}/videos`, {
      method: "GET",
      params: {
        part: "snippet,contentDetails,statistics,status",
        id: videoId,
      },
    });
    const item = response.data?.items?.[0];
    if (!item) return null;

    const snippet = item.snippet ?? {};
    const contentDetails = item.contentDetails ?? {};
    const stats = item.statistics ?? {};
    const status = item.status ?? {};
    const duration: string = contentDetails.duration ?? "PT0S";

    return {
      videoId,
      title: snippet.title ?? "",
      description: snippet.description ?? "",
      channelId: snippet.channelId ?? "",
      channelTitle: snippet.channelTitle ?? "",
      publishedAt: snippet.publishedAt ?? "",
      thumbnail: pickThumbnail(snippet.thumbnails),
      thumbnails: snippet.thumbnails ?? {},
      tags: snippet.tags ?? [],
      categoryId: snippet.categoryId ?? "",
      defaultAudioLanguage: snippet.defaultAudioLanguage,
      duration,
      durationSeconds: parseIsoDurationSeconds(duration),
      licensedContent: !!contentDetails.licensedContent,
      embeddable: status.embeddable !== false,
      privacyStatus: status.privacyStatus,
      madeForKids: status.madeForKids,
      viewCount: Number(stats.viewCount ?? 0),
      likeCount: Number(stats.likeCount ?? 0),
      commentCount: Number(stats.commentCount ?? 0),
      url: `https://youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  }
}

export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtube\.com\/watch\?[^#]*v=([A-Za-z0-9_-]{11})/i,
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/v\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const re of patterns) {
    const m = re.exec(trimmed);
    if (m && m[1]) return m[1];
  }
  return null;
}
