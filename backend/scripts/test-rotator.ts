import "dotenv/config";
import {
  YouTubeKeyRotator,
  getYouTubeKeyRotator,
} from "../src/utils/youtubeKeyRotator";
import { YoutubeService, extractYouTubeId } from "../src/services/YoutubeService";

async function main() {
  console.log("== YouTube Key Rotator self-test ==");

  const rotator = getYouTubeKeyRotator();
  console.log("Configured keys:", rotator.size());
  console.log("Status:", rotator.status());

  const service = new YoutubeService();

  const samples = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/jNQXAC9IVRw",
    "https://www.youtube.com/embed/9bZkp7q19f0",
  ];
  for (const url of samples) {
    const id = extractYouTubeId(url);
    console.log(`\n-- ${url} -> id=${id} --`);
    if (!id) continue;
    const info = await service.getRichVideoInfo(id);
    if (!info) {
      console.log("  NOT FOUND");
      continue;
    }
    console.log("  title:        ", info.title);
    console.log("  channel:      ", info.channelTitle);
    console.log("  duration:     ", info.duration, `(${info.durationSeconds}s)`);
    console.log("  views:        ", info.viewCount);
    console.log("  licensed:     ", info.licensedContent);
    console.log("  thumbnail:    ", info.thumbnail);
    console.log("  publishedAt:  ", info.publishedAt);
  }

  console.log("\n== Failover simulation (5 fake keys + real) ==");
  const fakeRotator = new YouTubeKeyRotator([
    "AIzaSyAA_INVALID_KEY_ZZZZZZZZZZZZZZZZZ001",
    "AIzaSyAA_INVALID_KEY_ZZZZZZZZZZZZZZZZZ002",
    "AIzaSyAA_INVALID_KEY_ZZZZZZZZZZZZZZZZZ003",
    process.env.YOUTUBE_API_KEYS!.split(",")[0],
  ]);
  try {
    const r = await fakeRotator.request<any>(
      "https://www.googleapis.com/youtube/v3/videos",
      { method: "GET", params: { part: "id", id: "dQw4w9WgXcQ" } }
    );
    console.log(
      "  failover result OK, items:",
      r.data?.items?.length,
      "status:",
      fakeRotator.status()
    );
  } catch (e: any) {
    console.log("  failover FAILED:", e?.response?.status, e?.message);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
