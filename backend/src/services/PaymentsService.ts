import axios from "axios";
import crypto from "crypto";

/**
 * Whop integration — mirrors transcript-back-v2/services/paymentsService.js
 * port to TypeScript.  Uses raw axios + manual Standard-Webhooks signature
 * verification so we don't depend on @whop/sdk.
 *
 * Exposed:
 *   - createWhopCheckout({ email, plan })
 *   - unwrapWhopWebhook(rawBody, headers)
 *   - lookupLatestWhopPayment({ email, sinceMinutes? })
 *   - extractWhopPlanAndAmount(payment)
 *   - computePremiumUntil(plan, existingUntil?)
 *   - debugWhopLookup(email)
 *   - priceFor(plan)
 *
 * Credentials live in .env. Checkout returns a redirect URL.
 */

const WHOP_API_BASE = "https://api.whop.com/api/v2";

const WHOP_API_KEY = (process.env.WHOP_API_KEY || "").trim();

// The webhook secret is base64-decoded by the Standard Webhooks library when
// it's prefixed `whsec_`. Trim whitespace/quotes — common copy-paste hazards
// that produce the opaque "Base64Coder: incorrect characters for decoding"
// failure.
const WHOP_WEBHOOK_SECRET = (process.env.WHOP_WEBHOOK_SECRET || "")
  .trim()
  .replace(/^["']|["']$/g, "");

// Whop issues two webhook secret formats with different HMAC key derivations:
//   - `ws_…`    → Whop native. The full string (incl. prefix) is the HMAC
//                  key as raw UTF-8 bytes. No base64 decoding.
//   - `whsec_…` → Standard Webhooks. The portion after the prefix is base64,
//                  and the decoded bytes are the HMAC key.
// Both use the same Standard-Webhooks header set
// (`webhook-id` / `webhook-timestamp` / `webhook-signature`) and the same
// `id.timestamp.body` signed payload.
function deriveWhopHmacKey(secret: string): Buffer {
  if (secret.startsWith("whsec_")) {
    return Buffer.from(secret.slice(6), "base64");
  }
  return Buffer.from(secret, "utf8");
}

function validateWhopWebhookSecret(secret: string): {
  ok: boolean;
  reason?: string;
} {
  if (!secret) return { ok: false, reason: "empty" };
  if (secret.startsWith("whsec_")) {
    const stripped = secret.slice(6);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripped)) {
      return { ok: false, reason: "whsec_-not-base64" };
    }
    try {
      const decoded = Buffer.from(stripped, "base64");
      if (decoded.length === 0)
        return { ok: false, reason: "whsec_-empty-after-decode" };
      return { ok: true };
    } catch {
      return { ok: false, reason: "whsec_-decode-failed" };
    }
  }
  if (secret.startsWith("ws_")) {
    if (secret.length < 10) return { ok: false, reason: "ws_-too-short" };
    return { ok: true };
  }
  return { ok: false, reason: "unknown-prefix (expected ws_ or whsec_)" };
}

const _whopSecretCheck = validateWhopWebhookSecret(WHOP_WEBHOOK_SECRET);
if (!_whopSecretCheck.ok && WHOP_WEBHOOK_SECRET) {
  console.error(
    `[whop] WHOP_WEBHOOK_SECRET is invalid (${_whopSecretCheck.reason}). ` +
      `Expected a Whop signing secret prefixed with "ws_" (dashboard webhooks) ` +
      `or "whsec_" (Standard Webhooks). All webhook deliveries will 401 until this is fixed.`
  );
}

const WHOP_SUCCESS_URL =
  process.env.WHOP_SUCCESS_URL ||
  "https://tubemusic.io/account?tab=subscription&success=1";
const WHOP_CANCEL_URL =
  process.env.WHOP_CANCEL_URL ||
  "https://tubemusic.io/pro?canceled=1";

// Whop API keys come in the form `biz_<companyId>_apik_<secret>`.
// We accept an explicit WHOP_COMPANY_ID override for unusual key shapes,
// otherwise we derive it from the prefix.
function deriveWhopCompanyId(apiKey: string): string {
  if (!apiKey) return "";
  const m = apiKey.match(/^(biz_[A-Za-z0-9]+?)_apik_/);
  return m ? m[1] : "";
}
const WHOP_COMPANY_ID =
  process.env.WHOP_COMPANY_ID || deriveWhopCompanyId(WHOP_API_KEY);
const WHOP_PRODUCT_EXTERNAL_ID =
  process.env.WHOP_PRODUCT_EXTERNAL_ID || "tubemusic-pro";
const WHOP_PRODUCT_TITLE = process.env.WHOP_PRODUCT_TITLE || "TubeMusic";

const PREMIUM_MONTHLY_PRICE_USD = parseFloat(
  process.env.PREMIUM_MONTHLY_PRICE_USD || "2.90"
);
const PREMIUM_YEARLY_PRICE_USD = parseFloat(
  process.env.PREMIUM_YEARLY_PRICE_USD || "19.90"
);

export type Plan = "monthly" | "yearly";

export function priceFor(plan: Plan): number {
  return plan === "yearly" ? PREMIUM_YEARLY_PRICE_USD : PREMIUM_MONTHLY_PRICE_USD;
}

export function whopConfigured(): boolean {
  return !!WHOP_API_KEY && !!WHOP_COMPANY_ID;
}

function whopHeaders() {
  return {
    Authorization: `Bearer ${WHOP_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Build a Whop checkout configuration with an inline plan + product
 * and return the hosted checkout URL.
 *
 * Body shape matches @whop/sdk's checkoutConfigurations.create:
 *   { mode, plan: { company_id, currency, plan_type, initial_price,
 *                   renewal_price, billing_period, title, description,
 *                   visibility, product: { external_identifier, title } },
 *     metadata, redirect_url }
 *
 * Pricing is driven by PREMIUM_MONTHLY_PRICE_USD / PREMIUM_YEARLY_PRICE_USD.
 */
export async function createWhopCheckout({
  email,
  plan,
}: {
  email: string;
  plan: Plan;
}): Promise<{ url: string; sessionId: string | null }> {
  if (!WHOP_API_KEY) {
    throw new Error("Whop not configured (missing WHOP_API_KEY)");
  }
  if (!WHOP_COMPANY_ID) {
    throw new Error(
      "Whop company id missing — set WHOP_COMPANY_ID, or use an API key formatted as biz_<id>_apik_<secret>"
    );
  }

  const isYearly = plan === "yearly";
  const price = priceFor(plan);
  const billingPeriod = isYearly ? 365 : 30;
  // Whop enforces a 30-character limit on plan title.
  const title = (isYearly ? "Pro yearly" : "Pro monthly").slice(0, 30);

  // Build redirect URL with the buyer's email + plan as query params so
  // the success page can run a backup confirmation if the webhook is
  // delayed or never lands.
  const successUrl = (() => {
    try {
      const u = new URL(WHOP_SUCCESS_URL);
      u.searchParams.set("session_id", email);
      u.searchParams.set("plan", plan || "monthly");
      u.searchParams.set("payment_method", "whop");
      return u.toString();
    } catch {
      const sep = WHOP_SUCCESS_URL.includes("?") ? "&" : "?";
      return `${WHOP_SUCCESS_URL}${sep}session_id=${encodeURIComponent(
        email
      )}&plan=${encodeURIComponent(plan || "monthly")}&payment_method=whop`;
    }
  })();

  const body = {
    mode: "payment",
    plan: {
      company_id: WHOP_COMPANY_ID,
      currency: "usd",
      plan_type: "renewal",
      // For RENEWAL plans, Whop charges initial_price ON TOP OF the
      // first renewal_price. Setting initial_price to 0 means the
      // first charge equals renewal_price (no double-billing).
      initial_price: 0,
      renewal_price: Math.round(price * 100) / 100,
      billing_period: billingPeriod,
      title,
      description: `TubeMusic — Pro ${
        isYearly ? "yearly" : "monthly"
      } subscription`,
      visibility: "hidden",
      product: {
        external_identifier: WHOP_PRODUCT_EXTERNAL_ID,
        title: WHOP_PRODUCT_TITLE,
      },
    },
    metadata: {
      email,
      customer_email: email,
      plan,
      source: "site-upgrade",
    },
    redirect_url: successUrl,
  };

  const response = await axios.post(
    `${WHOP_API_BASE}/checkout-configurations`,
    body,
    { headers: whopHeaders(), timeout: 15000 }
  );

  const config = response.data ?? {};
  const raw: string = config.purchase_url || "";
  if (!raw) {
    throw new Error("Whop response missing purchase_url");
  }
  const url = /^https?:\/\//i.test(raw)
    ? raw
    : `https://whop.com${raw.startsWith("/") ? "" : "/"}${raw}`;
  return { url, sessionId: config.id || null };
}

/**
 * Look up the most recent successfully-paid Whop payment for the given
 * email. Used as a backup when /webhooks/whop is delayed or dropped — the
 * success page calls /payments/confirm-checkout which falls back to this
 * lookup so the user still gets activated.
 */
export async function lookupLatestWhopPayment({
  email,
  sinceMinutes = 60 * 24,
}: {
  email: string;
  sinceMinutes?: number;
}): Promise<any | null> {
  if (!WHOP_API_KEY || !email) return null;
  try {
    const params: any = {
      query: email,
      statuses: ["paid"],
      first: 5,
      order: "paid_at",
      direction: "desc",
      include_free: false,
    };
    if (WHOP_COMPANY_ID) params.company_id = WHOP_COMPANY_ID;

    const resp = await axios.get(`${WHOP_API_BASE}/payments`, {
      params,
      headers: whopHeaders(),
      timeout: 15000,
    });
    const items: any[] = resp.data?.data || [];
    if (!items.length) return null;

    const cutoff = Date.now() - sinceMinutes * 60 * 1000;
    const inWindow = items
      .map((p) => {
        const t =
          p?.paid_at != null
            ? typeof p.paid_at === "number"
              ? p.paid_at * 1000
              : Date.parse(p.paid_at)
            : null;
        return { p, ts: Number.isFinite(t) ? (t as number) : null };
      })
      .filter((row) => row.ts !== null && row.ts >= cutoff)
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));

    return inWindow[0]?.p || items[0] || null;
  } catch (err: any) {
    console.warn(
      "[lookupLatestWhopPayment] error:",
      err?.response?.data || err?.message || err
    );
    return null;
  }
}

/**
 * Verify and unwrap a Whop webhook using the Standard Webhooks signing
 * scheme (headers webhook-id / webhook-signature / webhook-timestamp).
 *
 * Returns { ok: true, event } on success, or { ok: false, reason } so callers
 * can log a precise diagnostic.
 */
export function unwrapWhopWebhook(
  rawBody: Buffer | string,
  headers: Record<string, any>
): { ok: true; event: any } | { ok: false; reason: string } {
  if (!WHOP_WEBHOOK_SECRET) {
    return { ok: false, reason: "missing-WHOP_WEBHOOK_SECRET" };
  }
  if (!_whopSecretCheck.ok) {
    return {
      ok: false,
      reason:
        `WHOP_WEBHOOK_SECRET malformed (${_whopSecretCheck.reason}) — ` +
        `copy the signing secret from the Whop dashboard (ws_… or whsec_…)`,
    };
  }

  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const sigHeader = headers["webhook-signature"];
  if (!id || !timestamp || !sigHeader) {
    return {
      ok: false,
      reason:
        "missing webhook-id/webhook-timestamp/webhook-signature header",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(String(timestamp), 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60) {
    return {
      ok: false,
      reason: `timestamp out of tolerance (now=${now}, header=${timestamp})`,
    };
  }

  const secretBytes = deriveWhopHmacKey(WHOP_WEBHOOK_SECRET);
  const text = Buffer.isBuffer(rawBody)
    ? rawBody.toString("utf8")
    : String(rawBody);
  const expected = crypto
    .createHmac("sha256", new Uint8Array(secretBytes))
    .update(`${id}.${timestamp}.${text}`)
    .digest("base64");

  // Header value is a space-separated list of "<version>,<sig>" pairs.
  // We accept any v1 entry that matches.
  const candidates = String(sigHeader)
    .split(" ")
    .map((entry) => {
      const idx = entry.indexOf(",");
      return idx === -1
        ? null
        : { version: entry.slice(0, idx), value: entry.slice(idx + 1) };
    })
    .filter((p): p is { version: string; value: string } => !!p && p.version === "v1" && !!p.value);

  let matched = false;
  const expectedBuf = Buffer.from(expected);
  for (const { value } of candidates) {
    const candidateBuf = Buffer.from(value);
    if (candidateBuf.length !== expectedBuf.length) continue;
    try {
      if (
        crypto.timingSafeEqual(
          new Uint8Array(candidateBuf),
          new Uint8Array(expectedBuf)
        )
      ) {
        matched = true;
        break;
      }
    } catch {
      // length mismatch or non-buffer comparison — keep trying others
    }
  }
  if (!matched) {
    return { ok: false, reason: "signature mismatch" };
  }

  let event: any;
  try {
    event = JSON.parse(text);
  } catch {
    return { ok: false, reason: "body is not valid JSON" };
  }
  return { ok: true, event };
}

/**
 * Extract the canonical plan ('monthly'|'yearly') and USD amount from a
 * Whop payment object. Mirrors the inference logic in the webhook so the
 * fallback /confirm-checkout path produces the same answer.
 */
export function extractWhopPlanAndAmount(payment: any): {
  plan: Plan | null;
  amountUsd: number | null;
  paidAt: Date | null;
} {
  if (!payment) return { plan: null, amountUsd: null, paidAt: null };

  const planSource =
    payment?.plan ||
    payment?.membership?.plan ||
    payment?.subscription?.plan ||
    null;
  const billingPeriod =
    Number(planSource?.billing_period) ||
    Number(planSource?.billing_period_days) ||
    Number(planSource?.interval_days) ||
    null;
  const planLabel = (planSource?.title || planSource?.name || "").toLowerCase();

  const amountUsd =
    Number(payment?.usd_total) ||
    Number(payment?.subtotal) ||
    Number(payment?.final_amount) ||
    Number(payment?.total) ||
    Number(payment?.amount) ||
    Number(payment?.amount_paid) ||
    null;

  const yearlyPriceHint = parseFloat(
    process.env.PREMIUM_YEARLY_PRICE_USD || "19.90"
  );
  const monthlyPriceHint = parseFloat(
    process.env.PREMIUM_MONTHLY_PRICE_USD || "2.90"
  );

  const planFromMetadata: Plan | null =
    payment?.metadata?.plan ||
    payment?.membership?.metadata?.plan ||
    payment?.subscription?.metadata?.plan ||
    null;

  const planFromInference: Plan | null =
    (billingPeriod && billingPeriod >= 180 ? "yearly" : null) ||
    (billingPeriod && billingPeriod > 0 && billingPeriod < 180 ? "monthly" : null) ||
    (planLabel.includes("year") || planLabel.includes("annual")
      ? "yearly"
      : null) ||
    (planLabel.includes("month") ? "monthly" : null) ||
    (amountUsd && Math.abs(amountUsd - yearlyPriceHint) < 1 ? "yearly" : null) ||
    (amountUsd && Math.abs(amountUsd - monthlyPriceHint) < 1 ? "monthly" : null) ||
    null;

  const plan: Plan | null = planFromMetadata || planFromInference || null;

  const paidAtRaw = payment?.paid_at;
  let paidAt: Date | null = null;
  if (paidAtRaw != null) {
    const ts =
      typeof paidAtRaw === "number" ? paidAtRaw * 1000 : Date.parse(paidAtRaw);
    if (Number.isFinite(ts)) paidAt = new Date(ts);
  }

  return { plan, amountUsd, paidAt };
}

/**
 * Compute the `premium_until` date for a given plan starting now (or
 * extending from the user's existing premium_until if it's still in the
 * future).
 */
export function computePremiumUntil(
  plan: Plan,
  existingUntil: Date | string | null = null
): Date {
  const now = new Date();
  const base =
    existingUntil && new Date(existingUntil) > now
      ? new Date(existingUntil)
      : now;
  const next = new Date(base);
  if (plan === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}
