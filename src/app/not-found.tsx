import { Wordmark } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <Wordmark size={24} />
      <h1 className="nc-h1">this link isn&apos;t working.</h1>
      <p className="text-ash">
        It may have expired or been replaced with a new one. Message us and we&apos;ll send you a fresh link.
      </p>
    </main>
  );
}
