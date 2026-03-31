// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721  } from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import { Base64  } from "openzeppelin-contracts/contracts/utils/Base64.sol";
import { Strings } from "openzeppelin-contracts/contracts/utils/Strings.sol";

/// @dev Minimal interface — only the read we need.
interface ISignetPass {
    function isVerified(address wallet) external view returns (bool);
}

/// @title  SignetDemoBadge
/// @notice Non-transferable SBT that anyone can mint once they hold a valid
///         Signet attestation (checked via an existing SignetPass contract).
///
///         Demonstrates the "gate any on-chain action with isVerified()" pattern.
///         Metadata is fully on-chain as a data URI — no IPFS dependency.
///
/// Integration pattern used here:
///
///     ISignetPass(signetPass).isVerified(msg.sender)
///
/// Any project can do the same with one modifier.
contract SignetDemoBadge is ERC721 {
    using Strings for uint256;

    /// @notice The SignetPass contract whose `isVerified()` we check.
    ISignetPass public immutable signetPass;

    uint256 private _nextId = 1;

    /// @notice wallet → tokenId (0 = never minted).
    mapping(address => uint256) public tokenOf;

    error AlreadyMinted();
    error NotVerified();

    constructor(address _signetPass) ERC721("Signet Verified Member", "SGNL-BADGE") {
        signetPass = ISignetPass(_signetPass);
    }

    // ── Mint ─────────────────────────────────────────────────────────────────

    /// @notice Mint a badge to `msg.sender`.
    ///         Requires a valid Signet attestation — one badge per wallet.
    function mint() external {
        if (!signetPass.isVerified(msg.sender)) revert NotVerified();
        if (tokenOf[msg.sender] != 0)           revert AlreadyMinted();

        uint256 id = _nextId++;
        tokenOf[msg.sender] = id;
        _mint(msg.sender, id);
    }

    function hasMinted(address wallet) external view returns (bool) {
        return tokenOf[wallet] != 0;
    }

    function totalMinted() external view returns (uint256) {
        return _nextId - 1;
    }

    // ── SBT: block all transfers & burns ─────────────────────────────────────

    function _update(address to, uint256 id, address auth)
        internal override returns (address from)
    {
        from = super._update(to, id, auth);
        require(from == address(0), "Signet badge is non-transferable");
    }

    // ── On-chain metadata ─────────────────────────────────────────────────────

    function tokenURI(uint256 id) public view override returns (string memory) {
        require(_ownerOf(id) != address(0), "Token does not exist");
        string memory svg  = _buildSvg(id);
        string memory json = string(abi.encodePacked(
            '{"name":"Signet Verified Member #', id.toString(), '",',
            '"description":"A soulbound badge proving verified exchange history via ZK email proof on Base Sepolia.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":[',
                '{"trait_type":"Network","value":"Base Sepolia"},',
                '{"trait_type":"Type","value":"Soulbound"},',
                '{"trait_type":"Protocol","value":"Signet Pass"}',
            ']}'
        ));
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _buildSvg(uint256 id) internal pure returns (string memory) {
        string memory idStr = id.toString();
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">',
            '<defs>',
              '<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" style="stop-color:#0d0d1a"/>',
                '<stop offset="100%" style="stop-color:#1a1030"/>',
              '</linearGradient>',
              '<linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" style="stop-color:#6366f1"/>',
                '<stop offset="100%" style="stop-color:#a855f7"/>',
              '</linearGradient>',
            '</defs>',

            // Background
            '<rect width="400" height="400" fill="url(#bg)" rx="28"/>',
            '<rect x="1.5" y="1.5" width="397" height="397" fill="none" stroke="url(#ring)" stroke-width="1.5" rx="27" opacity="0.5"/>',

            // Outer glow ring
            '<circle cx="200" cy="155" r="72" fill="none" stroke="url(#ring)" stroke-width="1" opacity="0.3"/>',
            '<circle cx="200" cy="155" r="58" fill="#6366f115" stroke="url(#ring)" stroke-width="1.5" opacity="0.6"/>',

            // Checkmark
            '<circle cx="200" cy="155" r="42" fill="url(#ring)" opacity="0.18"/>',
            '<text x="200" y="168" text-anchor="middle" font-family="Arial,sans-serif" font-size="40" fill="#a5b4fc">&#x2713;</text>',

            // Title
            '<text x="200" y="256" text-anchor="middle" font-family="ui-monospace,monospace" font-size="14" font-weight="700" fill="#e2e8f0" letter-spacing="3">SIGNET</text>',
            '<text x="200" y="276" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#7c3aed" letter-spacing="2">VERIFIED MEMBER</text>',

            // Separator
            '<line x1="130" y1="298" x2="270" y2="298" stroke="#2d2060" stroke-width="1"/>',

            // Details
            '<text x="200" y="318" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" fill="#4b4080">ZK email proof &#xb7; Base Sepolia</text>',
            '<text x="200" y="334" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" fill="#4b4080">Non-transferable &#xb7; Soulbound</text>',

            // Token id
            '<text x="200" y="370" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="#2d2060"># ', idStr, '</text>',
            '</svg>'
        ));
    }
}
