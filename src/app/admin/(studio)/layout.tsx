import Link from "next/link";
import { Wordmark } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

const nav = [
  { href: "/admin", label: "Today" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-stone bg-bone/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" aria-label="Studio home">
            <Wordmark size={22} />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-bold sm:gap-4">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-pill px-3 py-2 hover:bg-ink/5">
                {item.label}
              </Link>
            ))}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-pill px-3 py-2 text-ash hover:bg-ink/5"
                title={`Signed in as ${profile.email}`}
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
