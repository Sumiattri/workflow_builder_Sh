import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Only the Clerk auth pages are public. Everything else requires a session.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId } = await auth();
  if (!userId) {
    // No marketing/home page — unauthenticated traffic goes straight to Clerk.
    const signInUrl = new URL("/sign-in", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|map)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
