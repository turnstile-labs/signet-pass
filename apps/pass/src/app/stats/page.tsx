import type { Metadata } from "next";
import { Suspense } from "react";
import { StatsClient } from "./StatsClient";

export const metadata: Metadata = {
    title:       "Protocol stats — Signet Pass",
    description: "Live on-chain stats for Signet Pass: total passes deployed, verifications, and protocol fees collected on Base Sepolia.",
};

export default function StatsPage() {
    return (
        <Suspense>
            <StatsClient />
        </Suspense>
    );
}
