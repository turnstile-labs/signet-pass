import type { Config } from "tailwindcss";

// All palette colors are driven by CSS variables so both themes
// (dark default + .light override) work with opacity modifiers like bg-accent/10.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                // page chrome
                bg:          v("bg"),
                surface:     v("surface"),
                "surface-2": v("surface-2"),
                // borders
                border:      v("border"),
                "border-h":  v("border-h"),
                // text
                text:        v("text"),
                white:       v("white"),   // "text-white" respects theme
                muted:       v("muted"),
                "muted-2":   v("muted-2"),
                // brand
                accent:      v("accent"),
                "accent-2":  v("accent-2"),
                // semantic
                green:       v("green"),
                red:         v("red"),
                amber:       v("amber"),
            },
            fontFamily: {
                mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "monospace"],
                sans: ["-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI", "sans-serif"],
            },
            maxWidth: {
                content: "680px",
            },
        },
    },
    plugins: [],
};

export default config;
