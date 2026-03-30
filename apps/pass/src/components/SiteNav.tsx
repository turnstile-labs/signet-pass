"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
    { href: "/demo",         label: "Demos"         },
    { href: "/how-it-works", label: "How it works"  },
    { href: "/developers",   label: "Developers"    },
];

function HamburgerIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M2 4.5h14M2 9h14M2 13.5h14"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M4 4L14 14M14 4L4 14"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

export function SiteNav({ wide = true }: { wide?: boolean }) {
    const pathname = usePathname();
    const maxW     = wide ? "max-w-3xl" : "max-w-2xl";
    const [open, setOpen] = useState(false);

    // Close the mobile menu whenever the route changes
    useEffect(() => { setOpen(false); }, [pathname]);

    return (
        <nav className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur-sm">

            {/* ── Main bar ────────────────────────────────────────────────── */}
            <div className={`${maxW} mx-auto px-6 h-14 flex items-center justify-between`}>

                {/* Brand */}
                <Link
                    href="/"
                    className="flex items-center gap-2 select-none group"
                    onClick={() => setOpen(false)}
                >
                    {/* Signet seal mark — hexagonal outline + centre dot */}
                    <svg
                        width="18" height="18" viewBox="0 0 20 20" fill="none"
                        className="text-accent flex-shrink-0 transition-opacity group-hover:opacity-80"
                        aria-hidden
                    >
                        <path
                            d="M10 1.5L17.79 6V14L10 18.5L2.21 14V6Z"
                            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
                        />
                        <circle cx="10" cy="10" r="2.4" fill="currentColor" />
                    </svg>

                    {/* Wordmark — single word, two colours */}
                    <span className="text-[1.02rem] font-bold tracking-tight leading-none">
                        <span style={{ color: "rgb(var(--text))" }}>Signet</span>
                        <span className="text-accent">Pass</span>
                    </span>

                    {/* Beta badge */}
                    <span className="font-mono text-[0.57rem] bg-accent/10 text-accent
                                     border border-accent/20 px-1.5 py-0.5 rounded-full leading-none">
                        beta
                    </span>
                </Link>

                {/* Desktop nav — hidden on mobile */}
                <div className="hidden sm:flex items-center gap-0.5">
                    {NAV_LINKS.map(({ href, label }) => {
                        const active = pathname === href;
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`px-3 py-2.5 min-h-[44px] flex items-center rounded-lg
                                            text-[0.78rem] font-medium transition-colors ${
                                    active
                                        ? "text-text bg-surface-2"
                                        : "text-muted hover:text-text hover:bg-surface-2/60"
                                }`}
                            >
                                {label}
                            </Link>
                        );
                    })}
                    <div className="ml-2 pl-2 border-l border-border">
                        <ThemeToggle />
                    </div>
                </div>

                {/* Mobile controls — hidden on desktop */}
                <div className="flex sm:hidden items-center gap-1">
                    <ThemeToggle />
                    <button
                        onClick={() => setOpen(o => !o)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg
                                   text-muted hover:text-text hover:bg-surface-2/60 transition-colors"
                        aria-label={open ? "Close menu" : "Open menu"}
                        aria-expanded={open}
                    >
                        {open ? <CloseIcon /> : <HamburgerIcon />}
                    </button>
                </div>

            </div>

            {/* ── Mobile dropdown menu ─────────────────────────────────────── */}
            {open && (
                <div className="sm:hidden border-t border-border bg-bg/95 backdrop-blur-sm">
                    <div className="px-3 py-2 space-y-0.5">
                        {NAV_LINKS.map(({ href, label }) => {
                            const active = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`flex items-center px-4 py-3.5 rounded-xl
                                                text-[0.92rem] font-medium transition-colors ${
                                        active
                                            ? "text-text bg-surface-2"
                                            : "text-muted hover:text-text hover:bg-surface-2/50"
                                    }`}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

        </nav>
    );
}
