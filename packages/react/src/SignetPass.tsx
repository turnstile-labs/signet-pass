"use client";

import React, { type ReactNode } from "react";
import { usePass }           from "./usePass";
import type { PassOptions }  from "@signet/sdk";

interface SignetPassProps extends PassOptions {
    /** The deployed Signet pass contract address. */
    contract:  `0x${string}`;
    /** Connected wallet address. Pass undefined when no wallet is connected. */
    wallet:    `0x${string}` | undefined | null;
    /** Rendered when the wallet holds a valid pass. */
    children:  ReactNode;
    /** Rendered when the wallet does NOT hold a pass. Defaults to null. */
    fallback?: ReactNode;
    /** Rendered while the check is in flight. Defaults to null. */
    loader?:   ReactNode;
}

/**
 * Conditionally renders `children` when the wallet holds a Signet pass.
 * Shows `fallback` (or nothing) otherwise.
 *
 * @example
 * import { SignetPass } from "@signet/react";
 * import { useAccount } from "wagmi";
 *
 * const PASS = "0xYOUR_PASS_ADDRESS";
 *
 * export function App() {
 *   const { address } = useAccount();
 *   return (
 *     <SignetPass contract={PASS} wallet={address}>
 *       <YourGatedContent />
 *     </SignetPass>
 *   );
 * }
 */
export function SignetPass({
    contract,
    wallet,
    chain,
    rpcUrl,
    children,
    fallback = null,
    loader   = null,
}: SignetPassProps) {
    const { verified, loading } = usePass({ contract, wallet, chain, rpcUrl });

    if (loading)   return <>{loader}</>;
    if (!verified) return <>{fallback}</>;
    return <>{children}</>;
}
