import { loginAction } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
      <h1 className="text-lg font-semibold">เข้าสู่ระบบผู้ดูแล</h1>
      <form action={loginAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? "/admin"} />
        <label className="flex flex-col gap-1">
          <span className="text-base text-muted">รหัสผ่าน</span>
          <input
            type="password"
            name="password"
            autoFocus
            required
            className="h-[46px] w-full rounded-[10px] border border-line bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </label>
        {error ? <p className="text-base text-red-600">รหัสผ่านไม่ถูกต้อง</p> : null}
        <button
          type="submit"
          className="min-h-11 rounded-[10px] bg-accent px-4 text-base font-medium text-white"
        >
          เข้าสู่ระบบ
        </button>
      </form>
    </main>
  );
}
