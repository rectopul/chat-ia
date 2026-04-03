export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
    const session = req.auth;
    const pathname = req.nextUrl.pathname;
    const isLoggedIn = Boolean(session?.user?.id);
    const isSuperAdmin = Boolean(session?.user?.isSuperAdmin);
    const hasActiveAccess = Boolean(session?.user?.hasActiveAccess);

    if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.nextUrl));
    }

    if (pathname.startsWith("/admin")) {
        if (!isSuperAdmin) {
            return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
        }

        return NextResponse.next();
    }

    if (pathname.startsWith("/billing")) {
        if (isSuperAdmin) {
            return NextResponse.redirect(
                new URL("/admin/dashboard", req.nextUrl),
            );
        }

        return NextResponse.next();
    }

    if (pathname.startsWith("/dashboard")) {
        if (isSuperAdmin) {
            return NextResponse.redirect(
                new URL("/admin/dashboard", req.nextUrl),
            );
        }

        if (!hasActiveAccess) {
            return NextResponse.redirect(new URL("/billing", req.nextUrl));
        }
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/admin/:path*", "/dashboard/:path*", "/billing/:path*"],
};
