"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";

const DOMAINS = [
    { id: "coinbase", label: "Coinbase",  hash: "19806930313339437892543285869542575252100319438226679350463646898451946018980", live: true  },
    { id: "binance",  label: "Binance",   hash: "BINANCE_PUBKEY_HASH",  live: false },
    { id: "kraken",   label: "Kraken",    hash: "KRAKEN_PUBKEY_HASH",   live: false },
    { id: "crypto",   label: "Crypto.com",hash: "CRYPTO_PUBKEY_HASH",   live: false },
    { id: "okx",      label: "OKX",       hash: "OKX_PUBKEY_HASH",      live: false },
];

function toUnix(dateStr: string): number {
    return Math.floor(new Date(dateStr).getTime() / 1000);
}

function generateSolidity(name: string, cutoffDate: string, domainId: string): string {
    const cutoff  = toUnix(cutoffDate);
    const domain  = DOMAINS.find(d => d.id === domainId)!;
    const domainHash = domain.live ? domain.hash : domain.hash + " /* register first */";
    const domainConstant = `uint256 public constant REQUIRED_DOMAIN = ${domainHash};`;
    const domainCheck = `\n        requireSignetDomain(msg.sender, CUTOFF, REQUIRED_DOMAIN);`;
    const isEligibleCheck = `isSignetEligibleDomain(wallet, CUTOFF, REQUIRED_DOMAIN)`;

    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@signet/contracts/SignetGated.sol";

contract ${name || "MyAirdrop"} is Ownable, Pausable, ReentrancyGuard, SignetGated {
    using SafeERC20 for IERC20;

    IERC20  public immutable token;
    uint256 public immutable amountPerWallet;
    address internal immutable _signet;

    uint256 public constant CUTOFF = ${cutoff}; // ${cutoffDate}
    ${domainConstant}

    mapping(address => bool) public claimed;

    event Claimed(address indexed wallet, uint256 amount);
    error AlreadyClaimed();
    error InvalidAddress();

    constructor(address _token, uint256 _amount, address _owner, address _signetAddress)
        Ownable(_owner)
    {
        if (_token == address(0) || _signetAddress == address(0)) revert InvalidAddress();
        token           = IERC20(_token);
        amountPerWallet = _amount;
        _signet         = _signetAddress;
        _pause();
    }

    function _signetAddress() internal view override returns (address) {
        return _signet;
    }

    function claim() external whenNotPaused nonReentrant {
        if (claimed[msg.sender]) revert AlreadyClaimed();${domainCheck}
        claimed[msg.sender] = true;
        emit Claimed(msg.sender, amountPerWallet);
        token.safeTransfer(msg.sender, amountPerWallet);
    }

    function isEligible(address wallet) external view returns (bool) {
        return !claimed[wallet] && ${isEligibleCheck};
    }

    function open()  external onlyOwner { _unpause(); }
    function close() external onlyOwner { _pause(); }
    function sweep(address to) external onlyOwner {
        token.safeTransfer(to, token.balanceOf(address(this)));
    }
}`;
}

export function ProtocolWizard() {
    const [name,     setName]     = useState("MyAirdrop");
    const [cutoff,   setCutoff]   = useState("2024-01-01");
    const [domainId, setDomainId] = useState("coinbase");

    const output = generateSolidity(name, cutoff, domainId);

    return (
        <div className="grid sm:grid-cols-[260px_1fr] gap-4">

            {/* ── Form ─────────────────────────────────────────────────────── */}
            <div className="bg-surface rounded-xl border border-border p-5 space-y-5 h-fit">
                <div>
                    <label className="block text-[0.72rem] font-mono text-muted-2 uppercase tracking-wider mb-1.5">
                        Contract name
                    </label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="MyAirdrop"
                        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2
                                   text-sm text-text placeholder:text-muted-2 outline-none
                                   focus:border-accent/50 font-mono"
                    />
                </div>

                <div>
                    <label className="block text-[0.72rem] font-mono text-muted-2 uppercase tracking-wider mb-1.5">
                        Cutoff date
                    </label>
                    <input
                        type="date"
                        value={cutoff}
                        onChange={e => setCutoff(e.target.value)}
                        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2
                                   text-sm text-text outline-none focus:border-accent/50
                                   [color-scheme:dark]"
                    />
                    <p className="text-[0.7rem] text-muted-2 mt-1">
                        Unix: {toUnix(cutoff).toLocaleString()}
                    </p>
                </div>

                <div>
                    <label className="block text-[0.72rem] font-mono text-muted-2 uppercase tracking-wider mb-2">
                        Email domain
                    </label>
                    <div className="space-y-1.5">
                        {DOMAINS.map(d => (
                            <label key={d.id}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border
                                            cursor-pointer transition-colors text-sm
                                            ${domainId === d.id
                                                ? "border-accent/50 bg-accent/5 text-text"
                                                : "border-border text-muted hover:border-border-h"
                                            }
                                            ${!d.live ? "opacity-50" : ""}`}>
                                <input
                                    type="radio"
                                    name="domain"
                                    value={d.id}
                                    checked={domainId === d.id}
                                    onChange={() => setDomainId(d.id)}
                                    disabled={!d.live}
                                    className="accent-[var(--accent)]"
                                />
                                <span>{d.label}</span>
                                {!d.live && <span className="text-[0.65rem] text-muted-2 ml-auto">soon</span>}
                            </label>
                        ))}
                    </div>
                </div>

            </div>

            {/* ── Output ───────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <CodeBlock
                    code={output}
                    language="solidity"
                    filename={`${name || "MyAirdrop"}.sol`}
                />
            </div>
        </div>
    );
}
