import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({
	path: process.env.NODE_ENV === "production" ? ".env" : ".env.development"
});

export const prisma = new PrismaClient();