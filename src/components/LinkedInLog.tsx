"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Logs the candidate's LinkedIn URL exactly once per page (per route).
 * Renders nothing.
 */
export default function LinkedInLog(): null {
  const pathname = usePathname();

  useEffect(() => {
    console.log(
      `[NextFlow] Candidate LinkedIn: ${
        process.env.NEXT_PUBLIC_CANDIDATE_LINKEDIN_URL ??
        "https://www.linkedin.com/in/REPLACE_ME"
      }`
    );
  }, [pathname]);

  return null;
}
