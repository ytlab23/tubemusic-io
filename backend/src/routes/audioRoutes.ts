import express, { Request, Response } from "express";
import { AudioController } from "../controllers/AudioController";

const router = express.Router();
const controller = new AudioController();

const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error(
        "Audio route error:",
        err.response?.data || err.message || err
      );
      const status = err.response?.status || 500;
      const message =
        err.response?.data?.error?.message ||
        err.message ||
        "An error occurred while processing the audio request.";
      res.status(status).json({ message });
    });
  };

router.get("/status", asyncHandler(controller.status));
router.get("/quota", asyncHandler(controller.quota));
router.post("/info", asyncHandler(controller.info));
router.post("/download", asyncHandler(controller.download));

export default router;
