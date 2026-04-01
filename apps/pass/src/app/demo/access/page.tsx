import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessGateClient } from "./AccessGateClient";

export const metadata: Metadata = {
    title:       "Secret URL Reveal — Signet Pass Demo",
    description: "Gate a private Discord invite behind a ZK proof. No bot. No role assignment. No integration with Discord. Verified wallets see the link.",
};

export default function AccessPage() {
    return (
        <Suspense>
            <AccessGateClient />
        </Suspense>
    );
}
