import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "@/components/auth-form";
import { normalizeWebRedirectPath, redirectAuthenticatedWebUserTo } from "@/lib/auth";
import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = normalizeWebRedirectPath(params.redirectTo);

  await redirectAuthenticatedWebUserTo(redirectTo);

  return (
    <main className="mx-auto grid min-h-screen content-center justify-items-center gap-4 px-4 py-10">
      <AuthForm action={loginAction} mode="login" redirectTo={redirectTo} />
      <Link href={`/register?redirectTo=${encodeURIComponent(redirectTo)}` as Route} className="font-bold underline">
        没有账号？注册学习端账号
      </Link>
    </main>
  );
}
