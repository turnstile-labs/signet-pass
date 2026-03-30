import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { PresaleGateClient } from "./PresaleGateClient";

export const metadata: Metadata = {
    title:       "SGNL Presale Gate — Signet Pass Demo",
    description: "Try the Signet Pass verification flow live: connect a wallet, generate a ZK proof from an exchange email, and unlock a token presale whitelist.",
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

export default function PresaleDemoPage() {
    return (
        <Suspense fallback={<Loading />}>
            <PresaleGateClient />
        </Suspense>
    );
}
