import type { Metadata } from "next";
import { redirect } from "next/navigation";

const APP_URL = process.env.NEXT_PUBLIC_PASS_URL ?? "https://signetpass.xyz";

interface Props { params: Promise<{ tokenId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { tokenId } = await params;
    const num   = parseInt(tokenId, 10);
    const title = `Signet Verified Member Badge #${num}`;
    const desc  = "Soulbound proof of verified crypto exchange history. Minted on Base Sepolia with a ZK email proof — unforgeable, non-transferable, on-chain forever.";
    const image = `${APP_URL}/api/og/badge/${num}`;

    return {
        title,
        description: desc,
        openGraph: {
            title,
            description: desc,
            url:    `${APP_URL}/demo/badge/${num}`,
            images: [{ url: image, width: 1200, height: 630 }],
        },
        twitter: {
            card:        "summary_large_image",
            title,
            description: desc,
            images:      [image],
        },
    };
}

// Page exists only for social unfurling — redirect to the live demo.
export default async function BadgeTokenPage() {
    redirect("/demo/badge");
}
