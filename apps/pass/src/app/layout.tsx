import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
    title:       "Signet — Verified access passes",
    description: "Deploy a verified access pass in one transaction. Share a link. Eligible wallets prove their exchange account age and get access — no bots, no self-reported claims.",
    icons:       { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗒️</text></svg>" },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
};

const noFlash = `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch{}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: noFlash }} />
            </head>
            <body className="flex flex-col min-h-screen">
                <Providers>
                    <div className="flex-1">{children}</div>
                    <footer className="border-t border-border mt-auto">
                        <div className="max-w-3xl mx-auto px-5 py-6 flex flex-col sm:flex-row
                                        sm:items-center sm:justify-between gap-3">
                            <div className="space-y-0.5">
                                <p className="font-mono text-[0.68rem] text-muted-2">
                                    © {new Date().getFullYear()} Signet Pass
                                </p>
                                <p className="font-mono text-[0.62rem] text-muted-2/60">
                                    ZK-verified access passes · Base Sepolia (testnet)
                                </p>
                            </div>
                            <div className="flex items-center gap-5">
                                <a href="/how-it-works" className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">How it works</a>
                                <a href="/developers"   className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Integrate</a>
                                <a href="/terms"        className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Terms</a>
                                <a href="/privacy"      className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Privacy</a>
                            </div>
                        </div>
                    </footer>
                </Providers>
            </body>
        </html>
    );
}
