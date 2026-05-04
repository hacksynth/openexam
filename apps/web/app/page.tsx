import Link from "next/link";

export default function HomePage() {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://127.0.0.1:3001";

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl content-center gap-6 px-4 py-10">
      <section className="pixel-panel grid gap-6 p-6 md:p-8">
        <div>
          <p className="mb-3 text-sm font-bold uppercase text-[var(--muted)]">Self-hostable AI exam prep</p>
          <h1 className="text-4xl font-black md:text-6xl">OpenExam</h1>
        </div>
        <p className="max-w-3xl text-lg font-bold leading-8 text-[var(--muted)]">
          Foundation build for a multi-exam learning platform. The first complete track targets Ruankao Software Designer.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="pixel-button px-4 py-2">
            Learner Dashboard
          </Link>
          <a href={adminUrl} className="pixel-button bg-white px-4 py-2">
            Admin Console
          </a>
        </div>
      </section>
    </main>
  );
}
