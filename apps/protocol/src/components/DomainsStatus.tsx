"use client";

import { useState, useEffect, useRef } from "react";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import {
    DKIM_REGISTRY_ADDRESS,
    DKIM_REGISTRY_ABI,
    LIVE_EXCHANGE_HASHES,
} from "@signet/sdk";

const client = createPublicClient({
    chain:     baseSepolia,
    transport: http("https://sepolia.base.org"),
});

const REGISTRY = DKIM_REGISTRY_ADDRESS.baseSepolia;

const DOMAINS = [
    { label: "coinbase.com",   hash: LIVE_EXCHANGE_HASHES.coinbase   },
    { label: "binance.com",    hash: LIVE_EXCHANGE_HASHES.binance    },
    { label: "kraken.com",     hash: LIVE_EXCHANGE_HASHES.kraken     },
    { label: "okx.com",        hash: LIVE_EXCHANGE_HASHES.okx        },
    { label: "bybit.com",      hash: LIVE_EXCHANGE_HASHES.bybit      },
    { label: "gemini.com",     hash: LIVE_EXCHANGE_HASHES.gemini     },
    { label: "crypto.com",     hash: LIVE_EXCHANGE_HASHES.cryptoCom  },
    { label: "kucoin.com",     hash: LIVE_EXCHANGE_HASHES.kucoin     },
    { label: "robinhood.com",  hash: LIVE_EXCHANGE_HASHES.robinhood  },
] as const;

type Status = "loading" | "valid" | "invalid" | "pending";

interface DomainRow {
    label:  string;
    status: Status;
}

async function checkDomain(hash: bigint): Promise<Status> {
    try {
        const valid = await client.readContract({
            address:      REGISTRY,
            abi:          DKIM_REGISTRY_ABI,
            functionName: "isValid",
            args:         [hash],
        });
        return valid ? "valid" : "invalid";
    } catch {
        return "invalid";
    }
}

function StatusDot({ status, size = "sm" }: { status: Status; size?: "sm" | "md" }) {
    const sz    = size === "md" ? "w-2 h-2" : "w-1.5 h-1.5";
    const pulse = status === "loading" ? "animate-pulse" : "";
    const color =
        status === "valid"   ? "bg-green"   :
        status === "invalid" ? "bg-red"     :
        status === "pending" ? "bg-muted-2" :
        /* loading */          "bg-muted-2";
    return <span className={`${sz} rounded-full ${color} ${pulse} flex-shrink-0`} />;
}

export function DomainsStatus() {
    const [open,    setOpen]    = useState(false);
    const [domains, setDomains] = useState<DomainRow[]>(
        DOMAINS.map(d => ({ label: d.label, status: "loading" as Status }))
    );
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        DOMAINS.forEach(async (d, i) => {
            const status = await checkDomain(d.hash);
            setDomains(prev => prev.map((r, j) => j === i ? { ...r, status } : r));
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const liveCount  = domains.filter(d => d.status === "valid").length;
    const totalCount = DOMAINS.length;
    const summaryStatus: Status = liveCount === 0 ? "loading" : "valid";

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 text-[0.78rem] text-muted
                           hover:text-text transition-colors cursor-pointer"
            >
                <StatusDot status={summaryStatus} />
                <span>Domains</span>
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+10px)] w-64
                                bg-surface border border-border rounded-xl shadow-lg
                                overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
                        <span className="text-[0.7rem] font-mono uppercase tracking-widest text-muted-2">
                            DKIM registry · Base Sepolia
                        </span>
                        <span className="text-[0.7rem] font-mono text-muted-2">
                            {liveCount}/{totalCount} live
                        </span>
                    </div>

                    <div className="divide-y divide-border">
                        {domains.map(d => (
                            <div key={d.label}
                                 className="flex items-center justify-between px-4 py-3">
                                <span className="font-mono text-[0.78rem] text-text">{d.label}</span>
                                <div className="flex items-center gap-2">
                                    <StatusDot status={d.status} size="md" />
                                    <span className={`text-[0.72rem] font-mono
                                        ${d.status === "valid"   ? "text-green"   :
                                          d.status === "invalid" ? "text-red"     :
                                          d.status === "pending" ? "text-muted-2" :
                                                                   "text-muted-2"}`}>
                                        {d.status === "valid"   ? "live"            :
                                         d.status === "invalid" ? "not registered"  :
                                         d.status === "pending" ? "coming soon"     :
                                                                   "checking…"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="px-4 py-3 border-t border-border bg-surface-2">
                        <a href="mailto:hello@signet.xyz"
                           className="text-[0.72rem] text-accent hover:text-accent-2 transition-colors">
                            Request a domain →
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
