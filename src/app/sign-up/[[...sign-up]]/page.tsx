import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <SignUp />
    </main>
  );
}
