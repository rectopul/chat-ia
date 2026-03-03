export const runtime = "nodejs";
import { prisma } from "@/lib/prisma";
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
