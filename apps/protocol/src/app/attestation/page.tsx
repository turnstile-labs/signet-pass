import { AttestationCard } from "@/components/AttestationCard";
import { SiteNav }         from "@/components/SiteNav";

interface Props {
    searchParams: Promise<{ wallet?: string }>;
}

export default async function AttestationPage({ searchParams }: Props) {
    const params = await searchParams;
    const wallet = params.wallet ?? null;

    return (
        <div className="min-h-screen flex flex-col">

            <SiteNav wide />

            {/* ── Main ─────────────────────────────────────────────────────── */}
            <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
                <div className="w-full">
                    <AttestationCard wallet={wallet} />
                </div>
            </main>

        </div>
    );
}
