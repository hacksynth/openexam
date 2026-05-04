import { AdminAuthForm } from "@/components/auth-form";
import { redirectAuthenticatedAdminUser } from "@/lib/auth";
import { adminLoginAction } from "./actions";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await redirectAuthenticatedAdminUser();
  const params = await searchParams;

  return (
    <main className="mx-auto grid min-h-screen content-center justify-items-center px-4 py-10">
      <AdminAuthForm
        action={adminLoginAction}
        initialError={params.error === "forbidden" ? "该账号没有管理端权限。" : null}
      />
    </main>
  );
}
