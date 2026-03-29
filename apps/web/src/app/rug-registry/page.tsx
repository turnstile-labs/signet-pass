import { redirect } from "next/navigation";

// The Rug Registry is now a standalone product.
// In production redirect to its own domain; in dev point to localhost:3001.
const RUG_REGISTRY_URL =
    process.env.NEXT_PUBLIC_RUG_REGISTRY_URL ?? "http://localhost:3001";

export default function RugRegistryRedirect() {
    redirect(RUG_REGISTRY_URL);
}
