import { YoutubeController } from "../controllers/YoutubeController";
import express, { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();
const youtubeController = new YoutubeController();

// Wrap async handlers to catch and report errors properly
const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error("Route error:", err.response?.data || err.message || err);
      const status = err.response?.status || 500;
      const message =
        err.response?.data?.error?.message ||
        err.message ||
        "An error occurred while processing the YouTube request.";
      res.status(status).json({ message });
    });
  };

router.post("/copyright-check", asyncHandler(youtubeController.checkCopyright));
router.post("/music-search", asyncHandler(youtubeController.searchMusic));
router.get("/genres", asyncHandler(youtubeController.getGenres));
router.get("/moods", asyncHandler(youtubeController.getMoods));
router.get("/channels", asyncHandler(youtubeController.getChannels));
router.get("/video-info", asyncHandler(youtubeController.videoInfo));
router.get("/keys-status", asyncHandler(youtubeController.keysStatus));
router.get(
  "/checks",
  authMiddleware,
  asyncHandler(youtubeController.listChecks)
);
router.post(
  "/checks/:id/flag",
  authMiddleware,
  asyncHandler(youtubeController.flagCheck)
);

export default router;
