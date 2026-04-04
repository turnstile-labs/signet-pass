import { NextResponse } from "next/server";
import { createPublicClient, http, type AbiEvent, formatEther } from "viem";
import { baseSepolia } from "viem/chains";

const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? "";
const RPC_URL     = ALCHEMY_KEY
    ? `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
    : "https://sepolia.base.org";

const FACTORY_ADDRESS = (
    process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "0xe97b2629dc1bff3d7445a534c4182a7d14003dc4"
) as `0x${string}`;

const FACTORY_ABI = [
    { inputs: [], name: "signetFee",      outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "signetTreasury", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "owner",          outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
] as const;

const DEPLOY_BLOCK = 39_000_000n;
const CHUNK        = 50_000n;

const PASS_DEPLOYED_EVENT = {
    type: "event", name: "PassDeployed",
    inputs: [
        { name: "pass",          type: "address",   indexed: true  },
        { name: "owner",         type: "address",   indexed: true  },
        { name: "cutoff",        type: "uint256",   indexed: false },
        { name: "allowedHashes", type: "uint256[]", indexed: false },
        { name: "feePerCheck",   type: "uint256",   indexed: false },
    ],
} as const satisfies AbiEvent;

const VERIFIED_EVENT = {
    type: "event", name: "Verified",
    inputs: [{ name: "wallet", type: "address", indexed: true }],
} as const satisfies AbiEvent;

const FEE_COLLECTED_EVENT = {
    type: "event", name: "FeeCollected",
    inputs: [
        { name: "pass",   type: "address", indexed: true  },
        { name: "wallet", type: "address", indexed: true  },
        { name: "amount", type: "uint256", indexed: false },
    ],
} as const satisfies AbiEvent;

const client = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

async function chunkedLogs<E extends AbiEvent>(
    event:     E,
    address:   `0x${string}` | `0x${string}`[],
    fromBlock: bigint,
    toBlock:   bigint,
) {
    const tasks = [];
    for (let from = fromBlock; from <= toBlock; from += CHUNK) {
        const to = from + CHUNK - 1n < toBlock ? from + CHUNK - 1n : toBlock;
        tasks.push(
            client.getLogs({ event, address, fromBlock: from, toBlock: to })
                  .catch(() => [])
        );
    }
    return (await Promise.all(tasks)).flat();
}

export async function GET() {
    try {
        const latest = await client.getBlockNumber();

        const [signetFee, treasury, factoryOwner] = await Promise.all([
            client.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "signetFee"      }) as Promise<bigint>,
            client.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "signetTreasury" }) as Promise<string>,
            client.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "owner"          }) as Promise<string>,
        ]);

        const treasuryBalWei = await client.getBalance({ address: treasury as `0x${string}` });
        const deployedLogs   = await chunkedLogs(PASS_DEPLOYED_EVENT, FACTORY_ADDRESS, DEPLOY_BLOCK, latest);
        const passAddresses  = deployedLogs.map(l => l.args.pass as `0x${string}`);

        let verificationCount = 0;
        let feeCollectedWei   = 0n;

        if (passAddresses.length > 0) {
            const recentFrom = latest > 500_000n ? latest - 500_000n : 0n;
            const [verifiedLogs, feeLogs] = await Promise.all([
                chunkedLogs(VERIFIED_EVENT,      passAddresses, recentFrom,   latest),
                chunkedLogs(FEE_COLLECTED_EVENT, passAddresses, DEPLOY_BLOCK, latest),
            ]);
            verificationCount = verifiedLogs.length;
            feeCollectedWei   = feeLogs.reduce((s, l) => s + (l.args.amount ?? 0n), 0n);
        }

        return NextResponse.json({
            blockNumber:       latest.toString(),
            passCount:         passAddresses.length,
            verificationCount,
            feeCollectedWei:   feeCollectedWei.toString(),
            signetFee:         signetFee.toString(),
            treasury,
            treasuryBalWei:    treasuryBalWei.toString(),
            factoryOwner,
            fetchedAt:         new Date().toISOString(),
            factoryAddress:    FACTORY_ADDRESS,
            signetFeeEth:      formatEther(signetFee),
            treasuryBalEth:    formatEther(treasuryBalWei),
            feeCollectedEth:   formatEther(feeCollectedWei),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "RPC error" },
            { status: 500 }
        );
    }
}
