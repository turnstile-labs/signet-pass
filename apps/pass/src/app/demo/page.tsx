import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteNav } from "@/components/SiteNav";
import { DemoClient } from "./DemoClient";

export const metadata: Metadata = {
    title:       "Live Demo — Signet Pass",
    description: "Experience the full Signet Pass flow: connect wallet, generate a ZK proof, unlock access. A real gate deployed on Base Sepolia.",
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

export default function DemoPage() {
    return (
        <Suspense fallback={<Loading />}>
            <DemoClient />
        </Suspense>
    );
}
