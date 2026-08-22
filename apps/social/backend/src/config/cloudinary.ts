import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config({
	path: process.env.NODE_ENV === "production" ? ".env" : ".env.development"
});

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
});

export const isCloudinaryConfigured = Boolean(
	process.env.CLOUDINARY_CLOUD_NAME &&
	process.env.CLOUDINARY_API_KEY &&
	process.env.CLOUDINARY_API_SECRET
);

export { cloudinary };