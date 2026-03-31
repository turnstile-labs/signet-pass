import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { CreateClient } from "./CreateClient";

export const metadata: Metadata = {
    title:       "Create a pass — Signet Pass",
    description: "Deploy a Signet Pass gate in one transaction. Set a cutoff date, share the link — no code required.",
};

function Loading() {
    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav />
            <main className="flex-1 flex items-center justify-center">
                <div className="w-5 h-5 relative">
                    <div className="absolute inset-0 border-2 border-accent/30 rounded-full" />
                    <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin" />
                </div>
            </main>
        </div>
    );
}

export default function CreatePage() {
    return (
        <Suspense fallback={<Loading />}>
            <CreateClient />
        </Suspense>
    );
}
