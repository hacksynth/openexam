import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "@/components/auth-form";
import { normalizeWebRedirectPath, redirectAuthenticatedWebUserTo } from "@/lib/auth";
import { withDefaultLocalePath } from "@/lib/locale";
import { registerAction } from "./actions";

type RegisterPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const redirectTo = normalizeWebRedirectPath(params.redirectTo);

  await redirectAuthenticatedWebUserTo(redirectTo);

  return (
    <main className="mx-auto grid min-h-screen content-center justify-items-center gap-4 px-4 py-10">
      <AuthForm action={registerAction} mode="register" redirectTo={redirectTo} />
      <Link href={withDefaultLocalePath(`/login?redirectTo=${encodeURIComponent(redirectTo)}`) as Route} className="font-bold underline">
        已有账号？登录学习端
      </Link>
    </main>
  );
}
