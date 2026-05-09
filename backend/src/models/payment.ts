import { Schema, model, HydratedDocument } from "mongoose";

export interface Payment {
  _id?: string;
  event_id: string;
  email: string;
  plan: "monthly" | "yearly";
  amount_usd: number;
  currency: string;
  source: "whop";
  event_type?: string;
  premium_until?: Date;
  logged_via?: string;
  raw?: any;
  created_at?: Date;
}

export type PaymentDocument = HydratedDocument<Payment>;

const PaymentSchema = new Schema<Payment>(
  {
    event_id: { type: String, required: true, unique: true },
    email: { type: String, required: true, index: true },
    plan: { type: String, enum: ["monthly", "yearly"], required: true },
    amount_usd: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    source: { type: String, default: "whop" },
    event_type: String,
    premium_until: Date,
    logged_via: String,
    raw: Schema.Types.Mixed,
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

PaymentSchema.index({ email: 1, plan: 1, source: 1, created_at: -1 });

const PaymentModel = model<Payment>("Payment", PaymentSchema);
export default PaymentModel;
