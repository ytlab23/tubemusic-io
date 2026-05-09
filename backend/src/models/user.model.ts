import { Schema, model, Document, HydratedDocument } from "mongoose";

// Define the plain User type (no Mongoose fields)
export interface User {
  _id?: string;
  username: string;
  email: string;
  password: string;
  is_email_verified: boolean;
  is_pro?: boolean;
  premium_plan?: "monthly" | "yearly";
  premium_until?: Date;
  premium_source?: "whop";
  premium_updated_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Define the Mongoose-hydrated type
export type UserDocument = HydratedDocument<User>;

const UserSchema = new Schema<User>(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    is_email_verified: { type: Boolean, default: true },
    password: { type: String, required: true },
    is_pro: { type: Boolean, default: false, index: true },
    premium_plan: { type: String, enum: ["monthly", "yearly"] },
    premium_until: { type: Date, index: true },
    premium_source: { type: String, enum: ["whop"] },
    premium_updated_at: Date,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const UserModel = model<User>("User", UserSchema);
export default UserModel;
