import { Schema, model, HydratedDocument } from "mongoose";

export interface DownloadQuota {
  _id?: string;
  ip: string;
  device_id?: string;
  user_id?: string;
  video_id: string;
  duration_seconds?: number;
  ext?: string;
  bytes?: number;
  pro: boolean;
  createdAt?: Date;
  expiresAt?: Date;
}

export type DownloadQuotaDocument = HydratedDocument<DownloadQuota>;

const DAY_SECONDS = 24 * 60 * 60;

const DownloadQuotaSchema = new Schema<DownloadQuota>(
  {
    ip: { type: String, required: true, index: true },
    device_id: String,
    user_id: String,
    video_id: { type: String, required: true },
    duration_seconds: Number,
    ext: String,
    bytes: Number,
    pro: { type: Boolean, default: false },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: false } }
);

DownloadQuotaSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: DAY_SECONDS }
);
DownloadQuotaSchema.index({ ip: 1, device_id: 1, createdAt: -1 });
DownloadQuotaSchema.index({ user_id: 1, createdAt: -1 });

const DownloadQuotaModel = model<DownloadQuota>(
  "DownloadQuota",
  DownloadQuotaSchema
);
export default DownloadQuotaModel;
