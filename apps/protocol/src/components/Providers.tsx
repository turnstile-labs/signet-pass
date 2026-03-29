"use client";

import { useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { wagmiConfig } from "@/lib/wagmi-config";

const queryClient = new QueryClient();

function useDappMode(): "light" | "dark" {
    const [mode, setMode] = useState<"light" | "dark">("dark");

    useEffect(() => {
        const update = () =>
            setMode(document.documentElement.classList.contains("light") ? "light" : "dark");

        update();

        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, {
            attributes:      true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    return mode;
}

export function Providers({ children }: { children: React.ReactNode }) {
    const mode = useDappMode();

    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <ConnectKitProvider
                    mode={mode}
                    customTheme={{
                        "--ck-font-family":                    "inherit",
                        "--ck-border-radius":                  "14px",
                        "--ck-accent-color":                   "#6366f1",
                        "--ck-accent-text-color":              "#ffffff",
                        "--ck-primary-button-border-radius":   "12px",
                    }}
                >
                    {children}
                </ConnectKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
