import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ocean-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            SPLYT Admin
          </h1>
          <p className="text-sm text-ocean-400 mt-1">Operations Console</p>
        </div>
        <div className="bg-ocean-900 rounded-xl border border-ocean-700 p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
