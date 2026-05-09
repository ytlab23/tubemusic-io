import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import "dotenv/config";

import connectDB from "./database";
import userRoutes from "./routes";
import authRoutes from "./routes/authRoutes";
import youtubeRoutes from "./routes/youtubeRoutes";
import musicRoutes from "./routes/musicRoutes";
import tagRoutes from "./routes/tagRoutes";
import aiMusicRoutes from "./routes/aiMusicRoutes";
import audioRoutes from "./routes/audioRoutes";
import paymentsRoutes from "./routes/paymentsRoutes";
import { authMiddleware } from "./middleware/auth";
import { PaymentsController } from "./controllers/PaymentsController";
import { getYouTubeKeyRotator } from "./utils/youtubeKeyRotator";

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.SECRET_KEY || process.env.SECRET_KEY === "SECRET_KEY") {
  console.error(
    "[fatal] SECRET_KEY missing or set to the literal default. Set a strong SECRET_KEY in .env before starting."
  );
  process.exit(1);
}

const allowedOrigins = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    credentials: true,
  })
);

// ============================================================================
// PAYMENT WEBHOOKS — must register BEFORE express.json() so we can verify
// signatures against the raw body. Mirrors transcript-back-v2/server.js.
// ============================================================================
const paymentsController = new PaymentsController();
app.post(
  "/webhooks/whop",
  express.raw({ type: "*/*", limit: "1mb" }),
  paymentsController.whopWebhook
);

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "2mb" }));

app.use("/users", userRoutes);
app.use("/auth", authRoutes);
app.use("/youtube", youtubeRoutes);
app.use("/music", musicRoutes);
app.use("/tags", tagRoutes);
app.use("/ai-music", aiMusicRoutes);
app.use("/audio", audioRoutes);
app.use("/payments", paymentsRoutes);

app.get("/", (_req, res) => res.send("Server is running"));

app.get("/health", (_req, res) => {
  let yt: any = { configured: false };
  try {
    yt = getYouTubeKeyRotator().status();
    yt.configured = true;
  } catch (e: any) {
    yt = { configured: false, error: e?.message };
  }
  res.json({ ok: true, youtube: yt });
});

(async () => {
  await connectDB();
  try {
    const status = getYouTubeKeyRotator().status();
    console.log(
      `[boot] YouTube key rotator ready: ${status.available}/${status.total} keys available.`
    );
  } catch (e: any) {
    console.warn(`[boot] YouTube key rotator NOT configured: ${e?.message}`);
  }
  app.listen(PORT, () => {
    console.log(`Server started on ${PORT}`);
  });
})();
