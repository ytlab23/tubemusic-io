import axios from "axios";

const HOST = process.env.RAPIDAPI_MP3_HOST || "youtube-mp3-2025.p.rapidapi.com";
const PATH = "/v1/social/youtube/audio";

export type AudioExt = "mp3" | "m4a";

export interface RapidAudioResponse {
  videoId: string;
  title: string;
  author: string;
  channelId: string;
  thumbnail: any;
  lengthSeconds: number;
  viewCount: number;
  ext: AudioExt;
  linkDownload: string;
  linkDownloadProgress: string;
  linkStream: string;
  raw: any;
}

export class RapidAudioService {
  private get apiKey(): string | undefined {
    return process.env.RAPIDAPI_MP3_KEY;
  }

  enabled(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  async getAudio(
    videoId: string,
    ext: AudioExt = "mp3"
  ): Promise<RapidAudioResponse> {
    if (!this.enabled()) {
      throw new Error(
        "RAPIDAPI_MP3_KEY is not configured on the server."
      );
    }
    const response = await axios.get(`https://${HOST}${PATH}`, {
      params: { id: videoId, ext },
      headers: {
        "x-rapidapi-key": this.apiKey!,
        "x-rapidapi-host": HOST,
      },
      timeout: 20000,
    });
    const d = response.data ?? {};
    return {
      videoId: d.videoId ?? videoId,
      title: d.title ?? "",
      author: d.author ?? "",
      channelId: d.channelId ?? "",
      thumbnail: d.thumbnail ?? null,
      lengthSeconds: Number(d.lengthSeconds ?? 0),
      viewCount: Number(d.viewCount ?? 0),
      ext,
      linkDownload: d.linkDownload ?? "",
      linkDownloadProgress: d.linkDownloadProgress ?? "",
      linkStream: d.linkStream ?? "",
      raw: d,
    };
  }
}
