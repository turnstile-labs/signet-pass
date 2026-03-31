import { ImageResponse } from "next/og";

export const runtime = "edge";

const BADGE_CONTRACT = (
    process.env.NEXT_PUBLIC_DEMO_BADGE_CONTRACT ?? "0xff795afa87d5f81b40870f1feb0ea40fdb0be147"
);
const RPC_URL = "https://sepolia.base.org";

// ── Read tokenURI via raw JSON-RPC (no viem in edge runtime) ──────────────────

async function getTokenURI(tokenId: number): Promise<string | null> {
    // selector: keccak256("tokenURI(uint256)") = 0xc87b56dd
    const data = "0xc87b56dd" + tokenId.toString(16).padStart(64, "0");
    try {
        const res = await fetch(RPC_URL, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1,
                method:  "eth_call",
                params:  [{ to: BADGE_CONTRACT, data }, "latest"],
            }),
            signal: AbortSignal.timeout(4000),
        });
        const json = await res.json() as { result?: string; error?: unknown };
        if (!json.result || json.result === "0x") return null;

        // ABI-encoded string: [32 bytes offset][32 bytes length][data]
        const hex    = json.result.slice(2);
        const len    = parseInt(hex.slice(64, 128), 16);
        const strHex = hex.slice(128, 128 + len * 2);
        const bytes  = new Uint8Array(strHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function extractSvgDataUri(tokenUri: string): string | null {
    try {
        // tokenUri = "data:application/json;base64,<b64>"
        const b64json = tokenUri.split(",")[1];
        const json    = JSON.parse(atob(b64json)) as { image?: string };
        return json.image ?? null; // "data:image/svg+xml;base64,<b64>"
    } catch {
        return null;
    }
}

// ── OG image ──────────────────────────────────────────────────────────────────

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ tokenId: string }> }
) {
    const { tokenId: tokenIdStr } = await params;
    const tokenId = parseInt(tokenIdStr, 10);

    let badgeSrc: string | null = null;
    try {
        const uri = await getTokenURI(tokenId);
        if (uri) badgeSrc = extractSvgDataUri(uri);
    } catch { /* fallback to placeholder */ }

    return new ImageResponse(
        (
            <div
                style={{
                    display:         "flex",
                    width:           "100%",
                    height:          "100%",
                    backgroundColor: "#0d0d1a",
                    fontFamily:      "ui-monospace, monospace",
                    position:        "relative",
                    overflow:        "hidden",
                }}
            >
                {/* Purple radial glow */}
                <div style={{
                    position:   "absolute",
                    left:       140,
                    top:        "50%",
                    width:      520,
                    height:     520,
                    marginTop:  -260,
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.07) 50%, transparent 75%)",
                    display:    "flex",
                }} />

                {/* Left: badge */}
                <div style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    width:          460,
                    flexShrink:     0,
                }}>
                    {badgeSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={badgeSrc}
                            width={300}
                            height={300}
                            style={{
                                borderRadius: 32,
                                border:       "1.5px solid rgba(99,102,241,0.4)",
                                boxShadow:    "0 0 72px rgba(99,102,241,0.3), 0 0 24px rgba(168,85,247,0.2)",
                            }}
                            alt="badge"
                        />
                    ) : (
                        <div style={{
                            display:         "flex",
                            width:           300,
                            height:          300,
                            alignItems:      "center",
                            justifyContent:  "center",
                            backgroundColor: "#111124",
                            border:          "1.5px solid rgba(99,102,241,0.4)",
                            borderRadius:    32,
                            fontSize:        100,
                        }}>
                            ✓
                        </div>
                    )}
                </div>

                {/* Right: text */}
                <div style={{
                    display:        "flex",
                    flexDirection:  "column",
                    justifyContent: "center",
                    flex:           1,
                    paddingRight:   72,
                    gap:            0,
                }}>
                    {/* Eyebrow */}
                    <div style={{
                        display:      "flex",
                        alignItems:   "center",
                        gap:          10,
                        marginBottom: 20,
                    }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: "50%",
                            backgroundColor: "#6366f1",
                        }} />
                        <span style={{
                            color:          "#6366f1",
                            fontSize:       13,
                            fontWeight:     700,
                            letterSpacing:  4,
                            textTransform:  "uppercase",
                        }}>
                            Verified member
                        </span>
                    </div>

                    {/* Title */}
                    <span style={{
                        color:         "#e2e8f0",
                        fontSize:      68,
                        fontWeight:    800,
                        lineHeight:    1,
                        letterSpacing: -2,
                        marginBottom:  18,
                    }}>
                        Badge #{tokenId}
                    </span>

                    {/* Descriptor */}
                    <div style={{
                        display:       "flex",
                        flexDirection: "column",
                        gap:           6,
                        marginBottom:  32,
                    }}>
                        <span style={{ color: "#90909b", fontSize: 20 }}>
                            ZK email proof · Base Sepolia
                        </span>
                        <span style={{ color: "#5a5a74", fontSize: 16 }}>
                            Non-transferable · Soulbound
                        </span>
                    </div>

                    {/* Pill */}
                    <div style={{
                        display:         "flex",
                        alignSelf:       "flex-start",
                        backgroundColor: "rgba(99,102,241,0.12)",
                        border:          "1px solid rgba(99,102,241,0.35)",
                        borderRadius:    100,
                        padding:         "8px 20px",
                    }}>
                        <span style={{
                            color:         "#a5b4fc",
                            fontSize:      15,
                            fontWeight:    700,
                            letterSpacing: 2,
                            textTransform: "uppercase",
                        }}>
                            Signet Pass · On-chain
                        </span>
                    </div>

                    {/* Domain */}
                    <span style={{
                        color:      "#2d2060",
                        fontSize:   14,
                        marginTop:  32,
                    }}>
                        signetpass.xyz
                    </span>
                </div>
            </div>
        ),
        { width: 1200, height: 630 }
    );
}
