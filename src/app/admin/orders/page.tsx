import { requireSuperAdminUser } from "@/lib/server-session";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

export default async function AdminOrdersPage() {
    await requireSuperAdminUser();
    redirect("/admin/dashboard");
}
