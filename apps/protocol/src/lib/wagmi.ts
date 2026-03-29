import { createWalletClient, createPublicClient, custom, http } from "viem";
import { baseSepolia } from "viem/chains";
import { SIGNET_ADDRESSES as _SIGNET_ADDRESSES } from "@signet/sdk";

export {
    SIGNET_ADDRESSES,
    DKIM_REGISTRY_ADDRESS,
    RUG_SURVIVOR_SBT_ADDRESS,
    LIVE_EXCHANGE_HASHES,
    DEFUNCT_EXCHANGE_HASHES,
    ATTESTATION_CACHE_ABI,
    DKIM_REGISTRY_ABI,
    RUG_SURVIVOR_SBT_ABI,
} from "@signet/sdk";

// Derived from the SDK so it stays in sync with every contract redeployment.
export const ATTESTATION_CACHE_ADDRESS = _SIGNET_ADDRESSES.baseSepolia;

export function getWalletClient() {
    if (typeof window === "undefined" || !window.ethereum) return null;
    return createWalletClient({
        chain:     baseSepolia,
        transport: custom(window.ethereum),
    });
}

export function getPublicClient() {
    return createPublicClient({
        chain:     baseSepolia,
        transport: http("https://sepolia.base.org"),
    });
}
