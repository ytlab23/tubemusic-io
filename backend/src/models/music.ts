import { Schema, model, HydratedDocument } from "mongoose";

export interface Music {
  _id?: string;
  video_id: string;
  user_id: string;
  url: string;
  thumbnail?: string;
  title?: string;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type MusicDocument = HydratedDocument<Music>;

const MusicSchema = new Schema<Music>(
  {
    video_id: { type: String, required: true },
    user_id: { type: String, required: true },
    url: { type: String, required: true },
    thumbnail: { type: String },
    title: { type: String },
    tags: { type: [String] },
  },
  { versionKey: false, timestamps: true }
);

const MusicModel = model<Music>("Music", MusicSchema);
export default MusicModel;
