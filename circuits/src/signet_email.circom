pragma circom 2.1.6;

include "@zk-email/circuits/lib/sha.circom";
include "@zk-email/circuits/lib/rsa.circom";
include "@zk-email/circuits/utils/bytes.circom";
include "@zk-email/circuits/utils/array.circom";
include "@zk-email/circuits/utils/hash.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/// @title SignetEmailVerifier
/// @notice Proves a valid DKIM-signed email from a supported exchange using
///         partial-SHA header hashing.
///
/// How partial-SHA works for headers:
///   The canonical DKIM signed-block always ends with the DKIM-Signature header
///   itself (RFC 6376 §5.4). Everything before that line is hashed off-circuit
///   (precomputedSHA). Only the DKIM-Signature line — ~300-450 bytes — is
///   processed inside the circuit. This allows arbitrarily long header blocks
///   (KuCoin 1600 bytes, EngageLab etc.) without growing circuit size.
///
/// Trade-off vs previous design:
///   email_recipient (Poseidon of the To: address) is removed. The To: header
///   appears before the DKIM-Sig in the canonical block, so it lives in the
///   precomputed prefix and cannot be extracted inside the circuit. One-wallet-
///   one-attestation is still enforced on-chain via proverETHAddress.
///
/// @param maxHeadersLength  Suffix buffer size in bytes. Must be a multiple of
///                          64. 640 (= 10 SHA-256 blocks) comfortably fits any
///                          DKIM-Signature line (max ~450 bytes) plus alignment.
/// @param n                 RSA chunk width in bits.  Use 121 (ZK Email std).
/// @param k                 RSA chunk count.          Use 17  (n*k = 2057 > 2048).
/// @param timestampLen      Fixed length of the DKIM t= value in digits. Use 10.
///
/// Public signal layout (order: outputs first, then public inputs):
///   [0] pubkeyHash       — Poseidon hash of the RSA modulus (exchange key ID)
///   [1] email_timestamp  — Unix timestamp from the DKIM t= tag (authenticated)
///   [2] proverETHAddress — caller's Ethereum wallet address (uint256)

template SignetEmailVerifier(maxHeadersLength, n, k, timestampLen) {

    // ── Inputs ────────────────────────────────────────────────────────────────

    // The suffix of the canonical signed header block: starts at the 64-byte
    // SHA-256 block boundary immediately before the DKIM-Signature line, and
    // runs to the end of the SHA-256 padded full canonical block.
    // Padded with zeros to maxHeadersLength.
    signal input emailHeader[maxHeadersLength];
    signal input emailHeaderLength;

    // SHA-256 intermediate state after processing all full 64-byte blocks that
    // precede emailHeader. Represented as 32 bytes (8 × 32-bit big-endian words).
    // Pass the SHA-256 initial state when no prefix exists (short headers).
    signal input precomputedSHA[32];

    signal input pubkey[k];
    signal input signature[k];

    // Byte offset of the first digit of the DKIM t= value within emailHeader.
    signal input timestampIndex;

    // Caller's Ethereum address — public, binds the proof to one wallet.
    signal input proverETHAddress;

    // ── Outputs ───────────────────────────────────────────────────────────────

    signal output pubkeyHash;
    signal output email_timestamp;

    // ── 1. Hash the header suffix (continuing from precomputed prefix state) ──

    signal sha[256] <== Sha256BytesPartial(maxHeadersLength)(
        emailHeader, emailHeaderLength, precomputedSHA
    );

    // ── 2. Pack SHA bits into RSA-chunk field elements ─────────────────────────
    // RSA message = SHA-256 hash re-packed as k chunks of n bits each.
    // The hash occupies the first ceil(256/n) chunks; remaining chunks are 0.

    var rsaMessageSize = (256 + n) \ n;
    component rsaMessage[rsaMessageSize];
    for (var i = 0; i < rsaMessageSize; i++) {
        rsaMessage[i] = Bits2Num(n);
    }
    for (var i = 0; i < 256; i++) {
        rsaMessage[i \ n].in[i % n] <== sha[255 - i];
    }
    for (var i = 256; i < n * rsaMessageSize; i++) {
        rsaMessage[i \ n].in[i % n] <== 0;
    }

    // ── 3. Verify RSA-SHA256 signature ────────────────────────────────────────

    component rsaVerifier = RSAVerifier65537(n, k);
    for (var i = 0; i < rsaMessageSize; i++) {
        rsaVerifier.message[i] <== rsaMessage[i].out;
    }
    for (var i = rsaMessageSize; i < k; i++) {
        rsaVerifier.message[i] <== 0;
    }
    rsaVerifier.modulus   <== pubkey;
    rsaVerifier.signature <== signature;

    // ── 4. Poseidon fingerprint of the RSA public key ─────────────────────────

    pubkeyHash <== PoseidonLarge(n, k)(pubkey);

    // ── 5. Extract DKIM t= timestamp ──────────────────────────────────────────
    //
    // The DKIM-Signature line is inside emailHeader (the suffix), so t= is
    // always present and indexed relative to the start of emailHeader.
    //
    // Approach:
    //   1. VarShiftLeft extracts a (timestampLen + 2)-byte window at
    //      (timestampIndex - 2), giving "t=NNNNNNNNNN".
    //   2. Assert bytes 0-1 are 't' (116) and '=' (61).
    //   3. Assert each of the next timestampLen bytes is an ASCII digit (48-57).
    //   4. DigitBytesToInt converts the digit bytes to a decimal integer.
    //
    // Constraint cost: ~32 constraints — vs ~150 000+ for a full DFA regex.
    // Security: the DKIM RSA signature authenticates every byte of emailHeader,
    // so an adversary cannot substitute a different timestamp index.

    var tsWindowLen = timestampLen + 2;  // "t=" + 10 digits

    component tsWindow = VarShiftLeft(maxHeadersLength, tsWindowLen);
    for (var i = 0; i < maxHeadersLength; i++) {
        tsWindow.in[i] <== emailHeader[i];
    }
    tsWindow.shift <== timestampIndex - 2;

    tsWindow.out[0] === 116;  // 't'
    tsWindow.out[1] === 61;   // '='

    component tsLow[timestampLen];
    component tsHigh[timestampLen];
    signal tsDigitBytes[timestampLen];

    for (var i = 0; i < timestampLen; i++) {
        tsDigitBytes[i] <== tsWindow.out[i + 2];

        tsLow[i] = LessEqThan(8);
        tsLow[i].in[0] <== 48;             // '0'
        tsLow[i].in[1] <== tsDigitBytes[i];
        tsLow[i].out === 1;

        tsHigh[i] = LessEqThan(8);
        tsHigh[i].in[0] <== tsDigitBytes[i];
        tsHigh[i].in[1] <== 57;            // '9'
        tsHigh[i].out === 1;
    }

    component tsToInt = DigitBytesToInt(timestampLen);
    for (var i = 0; i < timestampLen; i++) {
        tsToInt.in[i] <== tsDigitBytes[i];
    }
    email_timestamp <== tsToInt.out;
}

// ── Instantiation ─────────────────────────────────────────────────────────────
//
// maxHeadersLength = 640   (= 64 × 10; 10 SHA-256 blocks)
//                          Holds the DKIM-Signature suffix (≤ ~480 bytes) plus
//                          SHA-256 alignment bytes before it (≤ 63 bytes).
//                          Supports unlimited total header length via precomputedSHA.
// n = 121, k = 17          ZK Email standard 2048-bit RSA params.
// timestampLen = 10        Unix timestamps 1000000000–9999999999 (10 digits).
//
// proverETHAddress is declared public so the on-chain verifier can confirm the
// proof was generated for the exact caller without trusting off-chain inputs.

component main { public [proverETHAddress] } = SignetEmailVerifier(640, 121, 17, 10);
