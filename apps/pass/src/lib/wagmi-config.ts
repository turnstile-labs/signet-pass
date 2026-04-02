import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { coinbaseWallet, walletConnect, metaMask } from "wagmi/connectors";

const projectId  = process.env.NEXT_PUBLIC_WC_PROJECT_ID  ?? "";
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";

const APP_METADATA = {
    name:        "Signet Pass",
    description: "Verified access passes powered by ZK email proofs.",
    url:         "https://pass.signet.xyz",
    icons:       ["https://pass.signet.xyz/icon.png"],
};

export const wagmiConfig = createConfig({
    ssr:    true,
    chains: [baseSepolia, base],
    connectors: [
        coinbaseWallet({ appName: APP_METADATA.name, appLogoUrl: APP_METADATA.icons[0] }),
        metaMask({ dappMetadata: { name: APP_METADATA.name, url: APP_METADATA.url, iconUrl: APP_METADATA.icons[0] } }),
        ...(projectId ? [walletConnect({ projectId, metadata: APP_METADATA })] : []),
    ],
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
});
