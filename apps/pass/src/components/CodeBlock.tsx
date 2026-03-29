"use client";

import { useState } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import solidity   from "react-syntax-highlighter/dist/esm/languages/prism/solidity";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import tsx        from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import bash       from "react-syntax-highlighter/dist/esm/languages/prism/bash";

SyntaxHighlighter.registerLanguage("solidity",   solidity);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("tsx",        tsx);
SyntaxHighlighter.registerLanguage("bash",       bash);

const signetTheme: Record<string, React.CSSProperties> = {
    'code[class*="language-"]': {
        color:      "rgb(var(--muted))",
        background: "transparent",
        fontFamily: "inherit",
        fontSize:   "inherit",
        lineHeight: "inherit",
        whiteSpace: "pre",
    },
    'pre[class*="language-"]': {
        color:      "rgb(var(--muted))",
        background: "transparent",
        margin:     0,
        padding:    0,
        overflow:   "auto",
    },
    keyword:         { color: "rgb(var(--accent))",   fontStyle: "normal" },
    "attr-name":     { color: "rgb(var(--accent))"   },
    "builtin":       { color: "rgb(var(--accent-2))" },
    "class-name":    { color: "rgb(var(--text))",     fontWeight: "600" },
    "function":      { color: "rgb(var(--text))"     },
    string:          { color: "rgb(var(--green))"    },
    number:          { color: "rgb(var(--amber))"    },
    comment:         { color: "rgb(var(--muted-2))", fontStyle: "italic" },
    "block-comment": { color: "rgb(var(--muted-2))", fontStyle: "italic" },
    operator:        { color: "rgb(var(--muted))"   },
    punctuation:     { color: "rgb(var(--muted-2))" },
    boolean:         { color: "rgb(var(--amber))"   },
    constant:        { color: "rgb(var(--amber))"   },
    "regex":             { color: "rgb(var(--green))"    },
    "maybe-class-name":  { color: "rgb(var(--text))",   fontWeight: "600" },
    "property-access":   { color: "rgb(var(--muted))"   },
    "template-string":   { color: "rgb(var(--green))"   },
    "arrow":             { color: "rgb(var(--accent))"  },
    "tag":               { color: "rgb(var(--accent))"  },
    "attr-value":        { color: "rgb(var(--green))"   },
    "script":            { color: "rgb(var(--muted))"   },
};

interface CodeBlockProps {
    code:      string;
    language:  "solidity" | "typescript" | "tsx" | "bash";
    filename?: string;
    badge?:    string;
}

export function CodeBlock({ code, language, filename, badge }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-xl border border-border overflow-hidden bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-surface-2">
                <div className="flex items-center gap-3">
                    {filename && (
                        <span className="font-mono text-[0.68rem] text-muted-2">{filename}</span>
                    )}
                    {badge && (
                        <span className="font-mono text-[0.62rem] text-accent bg-accent/10
                                         border border-accent/20 px-1.5 py-0.5 rounded-full">
                            {badge}
                        </span>
                    )}
                </div>
                <button
                    onClick={copy}
                    className="font-mono text-[0.72rem] text-muted hover:text-accent
                               transition-colors cursor-pointer"
                >
                    {copied ? "✓ Copied" : "Copy"}
                </button>
            </div>
            <div className="px-5 py-4 overflow-auto text-[0.72rem] font-mono leading-relaxed max-h-[540px]">
                <SyntaxHighlighter
                    language={language}
                    style={signetTheme}
                    PreTag="div"
                    CodeTag="code"
                    useInlineStyles
                    wrapLines={false}
                >
                    {code}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}
