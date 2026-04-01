import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsClient } from "./StatsClient";

export const metadata: Metadata = {
    title:       "Protocol stats — Signet Pass",
    description: "Live on-chain stats for Signet Pass: total passes deployed, verifications, and protocol fees collected on Base Sepolia.",
    // Not linked from public nav — intended for Signet team use.
    robots: { index: false, follow: false },
};

export default function StatsPage() {
    return (
        <Suspense>
            <StatsClient />
        </Suspense>
    );
}
