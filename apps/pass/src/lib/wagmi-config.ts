import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";

const projectId  = process.env.NEXT_PUBLIC_WC_PROJECT_ID  ?? "";
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";

export const wagmiConfig = createConfig({
    ssr:    true,
    chains: [baseSepolia, base],
    connectors: [
        injected(),
        coinbaseWallet({ appName: "Signet" }),
        ...(projectId ? [walletConnect({ projectId })] : []),
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
