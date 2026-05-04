import Link from "next/link";
import type { Route } from "next";
import { AuthForm } from "@/components/auth-form";
import { redirectAuthenticatedWebUser } from "@/lib/auth";
import { registerAction } from "./actions";

export default async function RegisterPage() {
  await redirectAuthenticatedWebUser();

  return (
    <main className="mx-auto grid min-h-screen content-center justify-items-center gap-4 px-4 py-10">
      <AuthForm action={registerAction} mode="register" />
      <Link href={"/login" as Route} className="font-bold underline">
        已有账号？登录学习端
      </Link>
    </main>
  );
}
