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
                    <footer className="border-t border-border">
                        <div className="max-w-3xl mx-auto px-6 py-5 flex flex-wrap items-center
                                        justify-between gap-4">
                            <span className="font-mono text-[0.68rem] text-muted-2">
                                © {new Date().getFullYear()} Signet
                            </span>
                            <div className="flex items-center gap-4">
                                <a href="/stats"      className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Stats</a>
                                <a href="/developers" className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Integrate</a>
                                <a href="/terms"      className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Terms</a>
                                <a href="/privacy"    className="font-mono text-[0.68rem] text-muted-2 hover:text-muted transition-colors">Privacy</a>
                            </div>
                        </div>
                    </footer>
                </Providers>
            </body>
        </html>
    );
}
