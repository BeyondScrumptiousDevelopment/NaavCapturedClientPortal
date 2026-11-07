import { Wordmark } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-between px-6 py-12">
      <Wordmark size={28} />
      <div>
        <h1 className="nc-display">capturing in progress...</h1>
        <p className="mt-6 text-ash">
          Looking for your photos or films? Open the personal link we sent you. It looks like{" "}
          <span className="font-bold text-ink">portal.naavcaptured.com/c/your-name</span>.
        </p>
      </div>
      <p className="nc-label text-ash">EST 2025.</p>
    </main>
  );
}
