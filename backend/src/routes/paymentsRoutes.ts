import express, { Request, Response } from "express";
import { PaymentsController } from "../controllers/PaymentsController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();
const controller = new PaymentsController();

const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error(
        "Payments route error:",
        err.response?.data || err.message || err
      );
      const status = err.response?.status || 500;
      const message =
        err.response?.data?.error?.message ||
        err.message ||
        "An error occurred while processing the payment request.";
      res.status(status).json({ message });
    });
  };

router.get("/status", asyncHandler(controller.status));
router.get("/me", authMiddleware, asyncHandler(controller.me));
router.post(
  "/create-checkout",
  authMiddleware,
  asyncHandler(controller.createCheckout)
);
router.post(
  "/confirm-checkout",
  authMiddleware,
  asyncHandler(controller.confirmCheckout)
);

export default router;
