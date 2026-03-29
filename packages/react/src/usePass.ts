"use client";

import { useState, useEffect, useCallback } from "react";
import { checkPass, type PassOptions } from "@signet/sdk";

export interface UsePassResult {
    /** True if the wallet holds a valid Signet pass for this contract. */
    verified: boolean;
    /** True while the check is in flight. */
    loading:  boolean;
    /** Error message, if the contract call failed. */
    error:    string | undefined;
    /** Re-run the check manually (e.g. after the user proves eligibility). */
    recheck:  () => void;
}

/**
 * React hook that checks whether a wallet holds a Signet pass.
 *
 * @example
 * function App() {
 *   const { address } = useAccount();
 *   const { verified, loading } = usePass({
 *     contract: "0xYOUR_PASS_ADDRESS",
 *     wallet:   address,
 *   });
 *
 *   if (loading)   return <Spinner />;
 *   if (!verified) return <ProveEligibility />;
 *   return <GatedContent />;
 * }
 */
export function usePass(
    opts: PassOptions & {
        /** The deployed Signet pass contract address. */
        contract: `0x${string}` | undefined | null;
        /** Wallet address to check. Pass undefined/null to skip. */
        wallet:   `0x${string}` | undefined | null;
    }
): UsePassResult {
    const [verified, setVerified] = useState(false);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | undefined>();
    const [tick,     setTick]     = useState(0);

    const recheck = useCallback(() => setTick(t => t + 1), []);

    useEffect(() => {
        if (!opts.contract || !opts.wallet) {
            setVerified(false);
            setError(undefined);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(undefined);

        checkPass(opts.contract, opts.wallet, { chain: opts.chain, rpcUrl: opts.rpcUrl })
            .then(v  => { if (!cancelled) setVerified(v); })
            .catch(e => { if (!cancelled) { setVerified(false); setError(e?.message ?? "Failed to check pass."); } })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts.contract, opts.wallet, opts.chain, opts.rpcUrl, tick]);

    return { verified, loading, error, recheck };
}
