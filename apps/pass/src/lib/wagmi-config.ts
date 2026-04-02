import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";
import { metaMask } from "wagmi/connectors";

const projectId  = process.env.NEXT_PUBLIC_WC_PROJECT_ID  ?? "";
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";

export const wagmiConfig = createConfig(
    getDefaultConfig({
        chains:   [baseSepolia, base],
        transports: {
            [baseSepolia.id]: http(
                alchemyKey
                    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
                    : "https://sepolia.base.org"
            ),
            [base.id]: http(
                alchemyKey
                    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
                    : "https://mainnet.base.org"
            ),
        },
        // Explicit MetaMask connector for mobile deep-link support
        connectors: [
            metaMask({ dappMetadata: { name: "Signet Pass", url: "https://signetpass.xyz" } }),
        ],
        walletConnectProjectId: projectId,
        appName:        "Signet Pass",
        appDescription: "Verified access passes powered by ZK email proofs.",
        appUrl:         "https://signetpass.xyz",
        appIcon:        "https://signetpass.xyz/icon.png",
    })
);
