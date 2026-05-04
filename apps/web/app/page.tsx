import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl content-center gap-6 px-4 py-10">
      <section className="pixel-panel grid gap-6 p-6 md:p-8">
        <div>
          <p className="mb-3 text-sm font-bold uppercase text-[var(--muted)]">自托管 AI 备考平台</p>
          <h1 className="text-4xl font-black md:text-6xl">OpenExam</h1>
        </div>
        <p className="max-w-3xl text-lg font-bold leading-8 text-[var(--muted)]">
          面向个人学习者的多考试备考系统。首个完整考试方向聚焦软考软件设计师。
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="pixel-button px-4 py-2">
            进入学习端
          </Link>
        </div>
      </section>
    </main>
  );
}
