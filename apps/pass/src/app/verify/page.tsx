import { VerifyFlow } from "@/components/VerifyFlow";

interface Props {
    searchParams: Promise<{ contract?: string; name?: string; redirect?: string }>;
}

export default async function VerifyPage({ searchParams }: Props) {
    const params          = await searchParams;
    const contractAddress = params.contract ?? null;
    const passName        = params.name     ?? null;
    const redirectTo      = params.redirect ?? null;

    return (
        <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md">
                <VerifyFlow
                    contractAddress={contractAddress}
                    passName={passName}
                    redirectTo={redirectTo}
                />
            </div>
        </div>
    );
}
