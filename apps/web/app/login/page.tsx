import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "@/components/auth-form";
import { redirectAuthenticatedWebUser } from "@/lib/auth";
import { loginAction } from "./actions";

export default async function LoginPage() {
  await redirectAuthenticatedWebUser();

  return (
    <main className="mx-auto grid min-h-screen content-center justify-items-center gap-4 px-4 py-10">
      <AuthForm action={loginAction} mode="login" />
      <Link href={"/register" as Route} className="font-bold underline">
        没有账号？注册学习端账号
      </Link>
    </main>
  );
}
