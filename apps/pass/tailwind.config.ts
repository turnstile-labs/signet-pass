import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                bg:          v("bg"),
                surface:     v("surface"),
                "surface-2": v("surface-2"),
                border:      v("border"),
                "border-h":  v("border-h"),
                text:        v("text"),
                white:       v("white"),
                muted:       v("muted"),
                "muted-2":   v("muted-2"),
                accent:      v("accent"),
                "accent-2":  v("accent-2"),
                green:       v("green"),
                blue:        v("blue"),
                red:         v("red"),
                amber:       v("amber"),
            },
            fontFamily: {
                mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "monospace"],
                sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI", "sans-serif"],
            },
        },
    },
    plugins: [],
};

export default config;
