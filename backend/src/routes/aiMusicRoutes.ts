import express, { Request, Response } from "express";
import { AIMusicController } from "../controllers/AIMusicController";

const router = express.Router();
const controller = new AIMusicController();

const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error("AI music route error:", err.response?.data || err.message || err);
      const status = err.response?.status || 500;
      const message =
        err.response?.data?.error?.message ||
        err.message ||
        "An error occurred while processing the AI music request.";
      res.status(status).json({ message });
    });
  };

router.get("/status", asyncHandler(controller.status));
router.get("/catalogue", asyncHandler(controller.catalogue));
router.get("/prompt-from-video", asyncHandler(controller.promptFromVideo));
router.post("/preview-prompt", asyncHandler(controller.previewPrompt));
router.post("/generate", asyncHandler(controller.generate));

export default router;
