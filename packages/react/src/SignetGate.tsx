"use client";

import React, { type ReactNode } from "react";
import { useSignet }             from "./useSignet";
import { SignetVerifyButton }    from "./SignetVerifyButton";
import type { SignetOptions }    from "@signet/sdk";

interface SignetGateProps extends SignetOptions {
    wallet:     `0x${string}` | undefined | null;
    returnUrl?: string;
    /** Rendered when the wallet is eligible. */
    children:   ReactNode;
    /** Custom fallback instead of the default SignetVerifyButton. */
    fallback?:  ReactNode;
    /** Custom loading indicator. */
    loader?:    ReactNode;
}

/**
 * Conditionally renders `children` when the wallet is Signet-eligible.
 * Shows a "Verify with Signet" button otherwise.
 *
 * @example
 * <SignetGate
 *   wallet={userAddress}
 *   cutoff={1704067200}
 *   returnUrl="https://myairdrop.xyz/claim"
 * >
 *   <ClaimButton />
 * </SignetGate>
 */
export function SignetGate({
    children,
    fallback,
    loader,
    wallet,
    returnUrl,
    ...opts
}: SignetGateProps) {
    const { eligible, loading, reason, proveUrl } = useSignet({
        wallet,
        returnUrl,
        ...opts,
    });

    if (loading) {
        return <>{loader ?? <span style={{ opacity: 0.5 }}>Checking eligibility…</span>}</>;
    }

    if (!eligible) {
        return <>{fallback ?? <SignetVerifyButton proveUrl={proveUrl} reason={reason} />}</>;
    }

    return <>{children}</>;
}
