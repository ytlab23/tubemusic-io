import { Schema, model, HydratedDocument } from "mongoose";

export interface CheckerLog {
  _id?: string;
  video_id: string;
  url: string;
  title?: string;
  channel?: string;
  thumbnail?: string;
  duration_seconds?: number;
  views?: number;
  copyright_free: boolean;
  found_in_library: boolean;
  score?: number;
  source: "tubepilot" | "youtube" | "manual";
  raw?: any;
  user_id?: string;
  ip?: string;
  user_agent?: string;
  flagged?: boolean;
  flag_reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CheckerLogDocument = HydratedDocument<CheckerLog>;

const FIVE_DAYS_SECONDS = 5 * 24 * 60 * 60;

const CheckerLogSchema = new Schema<CheckerLog>(
  {
    video_id: { type: String, required: true, index: true },
    url: { type: String, required: true },
    title: String,
    channel: String,
    thumbnail: String,
    duration_seconds: Number,
    views: Number,
    copyright_free: { type: Boolean, required: true },
    found_in_library: { type: Boolean, default: false },
    score: Number,
    source: { type: String, default: "tubepilot" },
    raw: Schema.Types.Mixed,
    user_id: String,
    ip: String,
    user_agent: String,
    flagged: { type: Boolean, default: false },
    flag_reason: String,
  },
  { versionKey: false, timestamps: true }
);

CheckerLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: FIVE_DAYS_SECONDS });
CheckerLogSchema.index({ createdAt: -1 });

const CheckerLogModel = model<CheckerLog>("CheckerLog", CheckerLogSchema);
export default CheckerLogModel;
