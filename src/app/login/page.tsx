import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-md place-items-center">
      <div className="w-full space-y-5">
        <div>
          <p className="text-sm font-medium text-primary">Private access</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Ahmad Product Council
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Sign in with Supabase magic links to create and store real council runs.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
