declare module "@zk-email/helpers" {
    export function generateEmailVerifierInputs(
        rawEmail: Buffer | Uint8Array,
        opts?: {
            maxHeadersLength?:  number;
            maxBodyLength?:     number;
            ignoreBodyHashCheck?: boolean;
            shaPrecomputeSelector?: string;
        }
    ): Promise<{
        emailHeader:       string[];
        emailHeaderLength: string;
        pubkey:            string[];
        signature:         string[];
        [k: string]:       unknown;
    }>;
}

declare module "snarkjs" {
    export const groth16: {
        fullProve(
            input:    Record<string, unknown>,
            wasmFile: string | Uint8Array,
            zkeyFile: string | Uint8Array
        ): Promise<{ proof: unknown; publicSignals: string[] }>;

        verify(
            vkey:          unknown,
            publicSignals: string[],
            proof:         unknown
        ): Promise<boolean>;
    };
}
