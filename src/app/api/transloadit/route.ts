import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { signedUploadParams } from "@/lib/transloadit-server";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const signed = signedUploadParams();
    return NextResponse.json(signed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
