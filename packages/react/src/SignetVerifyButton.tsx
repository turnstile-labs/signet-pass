"use client";

import React from "react";

interface SignetVerifyButtonProps {
    proveUrl: string;
    reason?:  string;
    /** Override the button label. Defaults to "Verify with Signet →" */
    label?:   string;
    /** Additional CSS class names for the anchor element. */
    className?: string;
}

/**
 * A button that sends the user to signet.xyz/prove.
 * The `?return=` param is already baked into `proveUrl` by useSignet / getProveUrl.
 *
 * @example
 * <SignetVerifyButton
 *   proveUrl="https://signet.xyz/prove?return=https%3A%2F%2Fmyairdrop.xyz"
 *   reason="No Signet attestation found."
 * />
 */
export function SignetVerifyButton({
    proveUrl,
    reason,
    label    = "Verify with Signet →",
    className,
}: SignetVerifyButtonProps) {
    return (
        <div>
            {reason && (
                <p style={{ fontSize: "0.8rem", opacity: 0.7, marginBottom: "0.5rem" }}>
                    {reason}
                </p>
            )}
            <a
                href={proveUrl}
                className={className}
                style={{
                    display:        "inline-block",
                    padding:        "0.6rem 1.2rem",
                    background:     "#6366f1",
                    color:          "#fff",
                    borderRadius:   "0.5rem",
                    fontWeight:     600,
                    fontSize:       "0.875rem",
                    textDecoration: "none",
                }}
            >
                {label}
            </a>
        </div>
    );
}
