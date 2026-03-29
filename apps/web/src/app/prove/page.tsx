import { ProveClient } from "@/components/ProveClient";
import { SiteNav }     from "@/components/SiteNav";

interface Props {
    searchParams: Promise<{ return?: string; wallet?: string }>;
}

export default async function ProvePage({ searchParams }: Props) {
    const params        = await searchParams;
    const returnUrl     = params.return ?? null;
    const prefillWallet = params.wallet ?? null;

    return (
        <div className="min-h-screen flex flex-col">
            <SiteNav wide showLinks={false} />
            <main className="flex-1 flex flex-col items-center px-6 py-12">
                <div className="w-full max-w-lg">
                    <ProveClient returnUrl={returnUrl} prefillWallet={prefillWallet} />
                </div>
            </main>
        </div>
    );
}
