"use client";

import { ChangePasswordForm } from "@/components/auth/change-password-form";

type SecurityTabProps = {
    userEmail: string;
};

export function SecurityTab({ userEmail }: SecurityTabProps) {
    return <ChangePasswordForm userEmail={userEmail} />;
}
