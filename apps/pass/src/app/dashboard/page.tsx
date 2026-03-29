import { Suspense } from "react";
import { SiteNav } from "@/components/SiteNav";
import { DashboardClient } from "./DashboardClient";

export const metadata = {
    title: "Pass Dashboard — Signet",
    description: "View verified passes, copy your share link, and export your allowlist as CSV.",
};

function Loading() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />
            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
                <div className="flex items-center gap-3 text-muted text-[0.85rem]">
                    <div className="w-4 h-4 relative flex-shrink-0">
                        <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                        <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                    </div>
                    Loading…
                </div>
            </main>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<Loading />}>
            <DashboardClient />
        </Suspense>
    );
}
