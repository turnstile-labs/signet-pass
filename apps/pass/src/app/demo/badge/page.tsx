import type { Metadata } from "next";
import { BadgeGateClient } from "./BadgeGateClient";

export const metadata: Metadata = {
    title:       "Verified Member Badge — Signet Pass Demo",
    description: "Prove your crypto exchange history and mint a soulbound member badge. A live demo of gating an on-chain mint with Signet Pass.",
};

export default function BadgeDemoPage() {
    return <BadgeGateClient />;
}
