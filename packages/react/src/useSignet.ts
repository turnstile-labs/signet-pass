"use client";

import { useState, useEffect, useCallback } from "react";
import {
    checkEligibility,
    getProveUrl,
    type Attestation,
    type SignetOptions,
} from "@signet/sdk";

export interface UseSignetResult {
    /** True if the wallet has a valid Signet attestation that passes the cutoff. */
    eligible:    boolean;
    /** True while the eligibility check is in flight. */
    loading:     boolean;
    /** The raw attestation, or null if none exists. */
    attestation: Attestation | null;
    /** Human-readable reason when eligible === false. */
    reason:      string | undefined;
    /** URL to send the user to signet.xyz/prove (with optional return redirect). */
    proveUrl:    string;
    /** Re-run the eligibility check manually (e.g. after user returns from proving). */
    recheck:     () => void;
}

/**
 * React hook that checks whether a wallet is eligible for a Signet-gated action.
 *
 * @example
 * function ClaimPage() {
 *   const { eligible, loading, proveUrl } = useSignet({
 *     wallet:  userAddress,
 *     cutoff:  1704067200,   // Jan 1 2024
 *   });
 *
 *   if (loading)   return <Spinner />;
 *   if (!eligible) return <a href={proveUrl}>Verify with Signet →</a>;
 *   return <ClaimButton />;
 * }
 */
export function useSignet(
    opts: SignetOptions & {
        /** Wallet address to check. Pass undefined/null to skip the check. */
        wallet:    `0x${string}` | undefined | null;
        /** Return URL passed to signet.xyz/prove after successful attestation. */
        returnUrl?: string;
    }
): UseSignetResult {
    const [eligible,    setEligible]    = useState(false);
    const [loading,     setLoading]     = useState(false);
    const [attestation, setAttestation] = useState<Attestation | null>(null);
    const [reason,      setReason]      = useState<string | undefined>();
    const [tick,        setTick]        = useState(0);

    const recheck = useCallback(() => setTick(t => t + 1), []);

    useEffect(() => {
        if (!opts.wallet) {
            setEligible(false);
            setAttestation(null);
            setReason("Wallet not connected.");
            return;
        }

        let cancelled = false;
        setLoading(true);

        checkEligibility(opts.wallet, opts).then(result => {
            if (cancelled) return;
            setEligible(result.eligible);
            setAttestation(result.attestation);
            setReason(result.reason);
        }).catch(err => {
            if (cancelled) return;
            setEligible(false);
            setReason("Failed to check eligibility. " + (err?.message ?? ""));
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts.wallet, opts.cutoff?.toString(), opts.pubkeyHash?.toString(), tick]);

    const proveUrl = getProveUrl({
        returnUrl: opts.returnUrl,
        wallet:    opts.wallet ?? undefined,
    });

    return { eligible, loading, attestation, reason, proveUrl, recheck };
}
