import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import LinkedInLog from "@/components/LinkedInLog";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextFlow",
  description: "LLM workflow builder",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <LinkedInLog />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
