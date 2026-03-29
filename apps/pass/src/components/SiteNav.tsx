"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
    { href: "/how-it-works", label: "How it works" },
    { href: "/developers",   label: "Developers"   },
];

export function SiteNav({ wide = true }: { wide?: boolean }) {
    const pathname  = usePathname();
    const maxW      = wide ? "max-w-3xl" : "max-w-2xl";

    return (
        <nav className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-sm">
            <div className={`${maxW} mx-auto px-6 h-14 flex items-center justify-between`}>

                {/* Brand — static, never linked */}
                <div className="flex items-center gap-2 select-none">
                    <span className="text-[1.05rem] font-bold tracking-tight text-white leading-none">
                        Signet
                    </span>
                    <span className="text-muted-2 text-[0.95rem] font-light leading-none">/</span>
                    <span className="text-[1.05rem] font-bold tracking-tight text-white leading-none">
                        Pass
                    </span>
                    <span className="font-mono text-[0.58rem] bg-accent/10 text-accent
                                     border border-accent/20 px-1.5 py-0.5 rounded-full leading-none">
                        beta
                    </span>
                </div>

                {/* Nav links + theme toggle */}
                <div className="flex items-center gap-0.5">
                    {NAV_LINKS.map(({ href, label }) => {
                        const active = pathname === href;
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`px-3 py-1.5 rounded-lg text-[0.78rem] font-medium transition-colors ${
                                    active
                                        ? "text-text bg-surface-2"
                                        : "text-muted hover:text-text hover:bg-surface-2/60"
                                }`}
                            >
                                {label}
                            </Link>
                        );
                    })}
                    <div className="ml-3 pl-3 border-l border-border">
                        <ThemeToggle />
                    </div>
                </div>

            </div>
        </nav>
    );
}
