export const runtime = "nodejs";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AdminLayoutClient from "@/components/AdminLayoutClient";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    return (
        <AdminLayoutClient session={session}>
            {children}
        </AdminLayoutClient>
    );
}
