import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import UserModel from "../models/user.model";
import PaymentModel from "../models/payment";
import {
  Plan,
  computePremiumUntil,
  createWhopCheckout,
  lookupLatestWhopPayment,
  priceFor,
  unwrapWhopWebhook,
  whopConfigured,
} from "../services/PaymentsService";

const SUCCESS_EVENTS = new Set([
  "payment.succeeded",
  "membership.activated",
  "invoice.paid",
]);

export class PaymentsController {
  status = async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        provider: "whop",
        enabled: whopConfigured(),
        monthly_usd: priceFor("monthly"),
        yearly_usd: priceFor("yearly"),
      },
    });
  };

  /**
   * Returns the authed user's current PRO entitlement straight from the DB.
   * The frontend caches this in localStorage so PRO-only features feel
   * instant on next visit, but always re-syncs on app boot so Whop
   * renewal/cancel reflects fast.
   */
  me = async (req: AuthRequest, res: Response) => {
    if (!req.user?.email) {
      return res.status(401).json({ error: "auth_required" });
    }
    const user = await UserModel.findOne({ email: req.user.email })
      .collation({ locale: "en", strength: 2 })
      .lean()
      .exec();
    if (!user) return res.status(404).json({ error: "user_not_found" });
    const now = Date.now();
    const isPro =
      !!user.is_pro &&
      !!user.premium_until &&
      new Date(user.premium_until).getTime() > now;
    res.json({
      success: true,
      data: {
        email: user.email,
        username: user.username,
        is_pro: isPro,
        premium_plan: user.premium_plan ?? null,
        premium_until: user.premium_until ?? null,
        premium_source: user.premium_source ?? null,
      },
    });
  };

  createCheckout = async (req: AuthRequest, res: Response) => {
    if (!whopConfigured()) {
      return res.status(503).json({
        error: "whop_not_configured",
        message:
          "Whop is not configured on the server. Set WHOP_API_KEY (and optionally WHOP_COMPANY_ID).",
      });
    }
    const email = req.user?.email;
    if (!email) {
      return res.status(401).json({ error: "auth_required" });
    }
    const planRaw = (req.body?.plan as string) || "monthly";
    const plan: Plan = planRaw === "yearly" ? "yearly" : "monthly";
    try {
      const { url, sessionId } = await createWhopCheckout({ email, plan });
      return res.json({ url, method: "whop", plan, sessionId });
    } catch (err: any) {
      console.error(
        "[create-checkout] error:",
        err?.response?.data || err?.message || err
      );
      const msg = err?.message || "Failed to create checkout";
      const status =
        msg.includes("not configured") || msg.includes("missing") ? 503 : 500;
      return res.status(status).json({ error: msg });
    }
  };

  whopWebhook = async (req: Request, res: Response) => {
    try {
      const rawBody = req.body as Buffer;
      const verified = unwrapWhopWebhook(rawBody, req.headers as any);
      if (!verified.ok) {
        console.warn(`[whop webhook] verification failed: ${verified.reason}`);
        return res
          .status(401)
          .json({ error: "invalid signature", reason: verified.reason });
      }

      const event = verified.event || {};
      const type: string = event.type || "";
      const data: any = event.data || {};
      const paymentId = data?.id || data?.payment?.id || null;
      const eventId = paymentId
        ? `whop:${paymentId}`
        : event.id || `whop-${Date.now()}`;

      if (!SUCCESS_EVENTS.has(type)) {
        console.log(`[whop webhook] ignored event ${type} (id=${eventId})`);
        return res.json({ received: true, ignored: type });
      }

      const rawEmail =
        data?.metadata?.email ||
        data?.metadata?.customer_email ||
        data?.metadata?.customerEmail ||
        data?.user?.email ||
        data?.email_address ||
        data?.membership?.user?.email ||
        data?.membership?.metadata?.email ||
        data?.membership?.metadata?.customer_email ||
        null;

      const planFromMetadata: Plan | null =
        data?.metadata?.plan ||
        data?.membership?.metadata?.plan ||
        data?.subscription?.metadata?.plan ||
        null;

      const planSource =
        data?.plan ||
        data?.membership?.plan ||
        data?.subscription?.plan ||
        null;
      const billingPeriod =
        Number(planSource?.billing_period) ||
        Number(planSource?.billing_period_days) ||
        Number(planSource?.interval_days) ||
        null;
      const planLabel = (
        planSource?.title ||
        planSource?.name ||
        ""
      ).toLowerCase();

      const inferredAmount =
        Number(data?.usd_total) ||
        Number(data?.subtotal) ||
        Number(data?.final_amount) ||
        Number(data?.total) ||
        Number(data?.amount) ||
        Number(data?.amount_paid) ||
        null;
      const yearlyPriceHint = parseFloat(
        process.env.PREMIUM_YEARLY_PRICE_USD || "19.90"
      );
      const monthlyPriceHint = parseFloat(
        process.env.PREMIUM_MONTHLY_PRICE_USD || "2.90"
      );

      const planFromInference: Plan | null =
        (billingPeriod && billingPeriod >= 180 ? "yearly" : null) ||
        (billingPeriod && billingPeriod > 0 && billingPeriod < 180
          ? "monthly"
          : null) ||
        (planLabel.includes("year") || planLabel.includes("annual")
          ? "yearly"
          : null) ||
        (planLabel.includes("month") ? "monthly" : null) ||
        (inferredAmount && Math.abs(inferredAmount - yearlyPriceHint) < 1
          ? "yearly"
          : null) ||
        (inferredAmount && Math.abs(inferredAmount - monthlyPriceHint) < 1
          ? "monthly"
          : null) ||
        null;

      const plan: Plan = planFromMetadata || planFromInference || "monthly";

      if (!rawEmail) {
        console.warn(`[whop webhook] no email on ${type} (id=${eventId})`);
        return res.json({ received: true, warning: "no email" });
      }

      const normalizedEmail = String(rawEmail).trim().toLowerCase();
      const user = await UserModel.findOne({
        email: normalizedEmail,
      })
        .collation({ locale: "en", strength: 2 })
        .exec();
      const email = user?.email || normalizedEmail;

      const effectivePlan: Plan =
        planFromMetadata || planFromInference || user?.premium_plan || plan;
      const premiumUntil = computePremiumUntil(
        effectivePlan,
        user?.premium_until || null
      );

      const amountUsd =
        Number(data?.usd_total) ||
        Number(data?.subtotal) ||
        Number(data?.total) ||
        Number(data?.amount) ||
        (effectivePlan === "yearly" ? yearlyPriceHint : monthlyPriceHint);

      // Soft dedup: Whop fires multiple events for the same purchase
      // (membership.activated, invoice.paid, payment.succeeded), each with
      // a different `data.id`, so the strict event_id key below can't catch
      // them. If a payment for the same email+plan was already logged in
      // the last 2 minutes, treat this delivery as a duplicate.
      const SOFT_DEDUP_MS = 2 * 60 * 1000;
      const recentDuplicate = await PaymentModel.findOne({
        email,
        plan: effectivePlan,
        source: "whop",
        created_at: { $gte: new Date(Date.now() - SOFT_DEDUP_MS) },
      })
        .sort({ created_at: -1 })
        .lean()
        .exec();
      if (recentDuplicate) {
        console.log(
          `[whop webhook] soft-dedup ${type} (id=${eventId}) for ${email}: ` +
            `same email+plan logged ${Math.round(
              (Date.now() -
                new Date(recentDuplicate.created_at!).getTime()) /
                1000
            )}s ago as ${recentDuplicate.event_id} (${recentDuplicate.event_type})`
        );
        return res.json({
          received: true,
          duplicate: true,
          dedupedAgainst: recentDuplicate.event_id,
        });
      }

      // Idempotency guard: insert the payments row first, keyed by event_id.
      // If we already have a row, this delivery is a Whop retry — return 200
      // without re-extending premium_until.
      let isNewEvent = false;
      try {
        const existing = await PaymentModel.findOne({ event_id: eventId })
          .lean()
          .exec();
        if (!existing) {
          await PaymentModel.create({
            event_id: eventId,
            email,
            plan: effectivePlan,
            amount_usd: amountUsd,
            currency: "usd",
            source: "whop",
            event_type: type,
            premium_until: premiumUntil,
            created_at: new Date(),
          });
          isNewEvent = true;
        }
      } catch (logErr: any) {
        if (logErr?.code === 11000) {
          // race lost — another delivery wrote the same event_id first
          console.log(
            `[whop webhook] race dedup ${type} (id=${eventId}) for ${email}`
          );
          return res.json({ received: true, duplicate: true });
        }
        console.error(
          "[whop webhook] failed to log payment:",
          logErr?.message || logErr
        );
        return res.status(500).json({ error: "log write failed" });
      }

      if (!isNewEvent) {
        console.log(
          `[whop webhook] duplicate ${type} (id=${eventId}) for ${email} ignored`
        );
        return res.json({ received: true, duplicate: true });
      }

      const updateResult = await UserModel.updateOne(
        { email },
        {
          $set: {
            is_pro: true,
            premium_plan: effectivePlan,
            premium_until: premiumUntil,
            premium_source: "whop",
            premium_updated_at: new Date(),
          },
        },
        { upsert: false, collation: { locale: "en", strength: 2 } }
      );

      if (updateResult.matchedCount === 0) {
        console.error(
          `[whop webhook] PAYMENT WITHOUT MATCHING USER — email=${email} plan=${effectivePlan} eventId=${eventId} type=${type}`
        );
        return res.json({ received: true, warning: "no_matching_user" });
      }

      console.log(
        `[whop webhook] ${type} → ${email} now ${effectivePlan} until ${premiumUntil.toISOString()}`
      );
      return res.json({ received: true });
    } catch (err: any) {
      console.error("[whop webhook] error:", err?.message || err);
      return res.status(500).json({ error: "webhook processing failed" });
    }
  };

  /**
   * Fallback used by /pro?success=1 redirect after a Whop checkout. The
   * webhook is the source of truth, but if it's delayed or dropped, the
   * buyer can land on the success page paid-but-not-Pro. This endpoint:
   *   1. Confirms the caller's identity via JWT.
   *   2. If a recent payments row from Whop already exists, makes sure the
   *      users doc is flagged Pro (idempotent).
   *   3. Otherwise looks the payment up directly in Whop and inserts a
   *      payments row ourselves so the admin payments tab still sees it.
   *
   * It only ever GRANTS Pro when the payments row is already present.
   */
  confirmCheckout = async (req: AuthRequest, res: Response) => {
    if (!req.user?.email) {
      return res.status(401).json({ error: "auth_required" });
    }
    try {
      const email = req.user.email;
      const user = await UserModel.findOne({ email })
        .collation({ locale: "en", strength: 2 })
        .exec();
      if (!user) return res.status(404).json({ error: "user_not_found" });

      const canonicalEmail = user.email || email;
      const now = new Date();
      const isAlreadyPro =
        user.is_pro === true &&
        user.premium_until &&
        new Date(user.premium_until) > now;

      if (isAlreadyPro) {
        return res.json({
          activated: true,
          alreadyPro: true,
          premium_until: user.premium_until,
          premium_plan: user.premium_plan || null,
        });
      }

      // 1) Fast path: webhook already landed and inserted a payments row.
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let recentPayment = await PaymentModel.findOne({
        email: canonicalEmail,
        source: "whop",
        created_at: { $gte: since },
      })
        .sort({ created_at: -1 })
        .lean()
        .exec();

      // 2) Backup path: webhook hasn't landed yet — look the payment up
      // directly in Whop and insert a payments row ourselves.
      if (!recentPayment) {
        if (!whopConfigured()) {
          return res.json({
            activated: false,
            pending: true,
            message:
              "Whop is not configured. Hang on a few seconds and refresh.",
          });
        }
        const whopPayment = await lookupLatestWhopPayment({
          email: canonicalEmail,
          sinceMinutes: 60 * 24,
        });
        if (!whopPayment?.id || !whopPayment?.paid_at) {
          return res.json({
            activated: false,
            pending: true,
            message:
              "Payment not yet received from Whop. Hang on a few seconds.",
          });
        }

        const meta = whopPayment.metadata || {};
        const planFromMeta = meta.plan || meta.billing || null;
        const planSource =
          whopPayment.plan || whopPayment.membership?.plan || null;
        const billingPeriod = Number(planSource?.billing_period) || null;
        const planLabel = (
          planSource?.title ||
          planSource?.name ||
          ""
        ).toLowerCase();
        const inferredAmount =
          Number(whopPayment.subtotal) ||
          Number(whopPayment.final_amount) ||
          Number(whopPayment.amount_after_fees) ||
          null;
        const yearlyPriceHint = parseFloat(
          process.env.PREMIUM_YEARLY_PRICE_USD || "19.90"
        );
        const monthlyPriceHint = parseFloat(
          process.env.PREMIUM_MONTHLY_PRICE_USD || "2.90"
        );

        const planFromInference: Plan | null =
          (billingPeriod && billingPeriod >= 180 ? "yearly" : null) ||
          (billingPeriod && billingPeriod > 0 && billingPeriod < 180
            ? "monthly"
            : null) ||
          (planLabel.includes("year") || planLabel.includes("annual")
            ? "yearly"
            : null) ||
          (planLabel.includes("month") ? "monthly" : null) ||
          (inferredAmount && Math.abs(inferredAmount - yearlyPriceHint) < 1
            ? "yearly"
            : null) ||
          (inferredAmount && Math.abs(inferredAmount - monthlyPriceHint) < 1
            ? "monthly"
            : null) ||
          null;

        const plan: Plan =
          planFromMeta || planFromInference || user.premium_plan || "monthly";

        const amountUsd =
          Number(whopPayment.subtotal) ||
          Number(whopPayment.final_amount) ||
          Number(whopPayment.amount_after_fees) ||
          (plan === "yearly" ? yearlyPriceHint : monthlyPriceHint);

        const premiumUntil = computePremiumUntil(
          plan,
          user.premium_until || null
        );
        const eventId = `whop:${whopPayment.id}`;

        try {
          const existing = await PaymentModel.findOne({ event_id: eventId })
            .lean()
            .exec();
          if (!existing) {
            await PaymentModel.create({
              event_id: eventId,
              email: canonicalEmail,
              plan,
              amount_usd: amountUsd,
              currency: (whopPayment.currency || "usd").toLowerCase(),
              source: "whop",
              event_type: "payment.succeeded",
              premium_until: premiumUntil,
              created_at: new Date(),
              logged_via: "confirm-checkout-fallback",
            });
          }
        } catch (logErr: any) {
          if (logErr?.code !== 11000) {
            console.error(
              "[confirm-whop-checkout] payment log failed:",
              logErr?.message || logErr
            );
            return res.status(500).json({ error: "log_write_failed" });
          }
        }

        recentPayment = await PaymentModel.findOne({ event_id: eventId })
          .lean()
          .exec();
      }

      const plan: Plan =
        (recentPayment?.plan as Plan) || user.premium_plan || "monthly";
      const premiumUntil = recentPayment?.premium_until
        ? new Date(recentPayment.premium_until)
        : computePremiumUntil(plan, user.premium_until || null);

      const updateResult = await UserModel.updateOne(
        { email: canonicalEmail },
        {
          $set: {
            is_pro: true,
            premium_plan: plan,
            premium_until: premiumUntil,
            premium_source: "whop",
            premium_updated_at: new Date(),
          },
        },
        { upsert: false, collation: { locale: "en", strength: 2 } }
      );

      if (updateResult.matchedCount === 0) {
        return res.status(404).json({ error: "user_not_found" });
      }

      return res.json({
        activated: true,
        premium_until: premiumUntil,
        premium_plan: plan,
      });
    } catch (err: any) {
      console.error(
        "[confirm-whop-checkout] error:",
        err?.message || err
      );
      return res.status(500).json({ error: "confirmation_failed" });
    }
  };
}
