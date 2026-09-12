"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Card, Empty, Button } from "@/components/ui";

/**
 * Hides a write-only page from viewers. This is UI courtesy — the same rule is
 * enforced in Postgres, so a viewer who navigates here directly still can't
 * write anything.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, profile } = useAuth();

  if (profile && !isAdmin) {
    return (
      <Card className="mx-auto max-w-lg">
        <Empty>
          <p className="text-sm font-semibold text-ink">Your account is view-only</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            You can browse stock, search and export, but recording movements and adding products
            need an admin account. Ask an admin to change your role if that&apos;s wrong.
          </p>
          <Link href="/inventory" className="mt-4 inline-block">
            <Button variant="secondary">Back to inventory</Button>
          </Link>
        </Empty>
      </Card>
    );
  }

  return <>{children}</>;
}
