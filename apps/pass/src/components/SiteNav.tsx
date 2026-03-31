"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
    { href: "/demo",         label: "Demos"        },
    { href: "/how-it-works", label: "How it works" },
    { href: "/developers",   label: "Integrate"    },
];

const CTA_LINK = { href: "/create", label: "My passes" };

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
                    className="flex items-end gap-1.5 select-none"
                    onClick={() => setOpen(false)}
                >
                    {/* Wordmark — single word, two colours */}
                    <span className="text-[1.02rem] font-bold tracking-tight leading-none">
                        <span style={{ color: "rgb(var(--text))" }}>Signet</span>
                        <span className="text-accent">Pass</span>
                    </span>

                    {/* Beta badge — sits at the baseline, slightly below the text cap */}
                    <span className="font-mono text-[0.52rem] bg-accent/10 text-accent
                                     border border-accent/20 px-1.5 py-[2px] rounded-full
                                     leading-none mb-[1px]">
                        beta
                    </span>
                </Link>

                {/* Desktop nav — hidden on mobile */}
                <div className="hidden sm:flex items-center gap-0.5">
                    {/* My passes CTA — leftmost, blue */}
                    <Link
                        href={CTA_LINK.href}
                        className="bg-accent text-[0.75rem] font-semibold px-3.5 py-1.5 rounded-lg
                                   hover:opacity-90 transition-opacity mr-1"
                        style={{ color: "#fff" }}
                        onClick={() => setOpen(false)}
                    >
                        {CTA_LINK.label}
                    </Link>
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
                        {/* My passes CTA — top of mobile menu, blue */}
                        <Link
                            href={CTA_LINK.href}
                            onClick={() => setOpen(false)}
                            className="flex items-center px-4 py-3.5 rounded-xl text-[0.92rem]
                                       font-semibold text-accent hover:bg-accent/8 transition-colors"
                        >
                            {CTA_LINK.label}
                        </Link>
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
