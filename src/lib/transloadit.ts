"use client";
// Client-side Transloadit upload: fetch signed params from our API,
// POST the file directly to Transloadit, poll the assembly, return the URL.

interface SignedParams {
  params: string;
  signature: string;
  url: string;
}

const ACCEPTED_IMAGE = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** Upload any file to Transloadit and return a hosted URL. */
export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const sigRes = await fetch("/api/transloadit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name }),
  });
  if (!sigRes.ok) throw new Error("Failed to get upload signature.");
  const { params, signature, url }: SignedParams = await sigRes.json();

  const form = new FormData();
  form.append("params", params);
  form.append("signature", signature);
  form.append("file", file);

  const createRes = await fetch(url, { method: "POST", body: form });
  if (!createRes.ok) throw new Error("Transloadit upload failed.");
  const assembly = await createRes.json();

  // poll until completion
  const statusUrl: string = assembly.assembly_ssl_url;
  let result = assembly;
  for (let i = 0; i < 60; i++) {
    if (result.ok === "ASSEMBLY_COMPLETED") break;
    if (result.error) throw new Error(result.error);
    onProgress?.(Math.min(95, i * 5));
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(statusUrl);
    result = await poll.json();
  }
  onProgress?.(100);

  const steps = result.results ?? {};
  const firstStep = Object.values(steps)[0] as
    | Array<{ ssl_url: string }>
    | undefined;
  const uploadUrl = (result.uploads?.[0]?.ssl_url as string) ?? undefined;
  const out = firstStep?.[0]?.ssl_url ?? uploadUrl;
  if (!out) throw new Error("No output URL from Transloadit.");
  return out;
}

/** Upload an image (validates common image types) and return a hosted URL. */
export async function uploadImage(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!ACCEPTED_IMAGE.includes(file.type)) {
    throw new Error("Unsupported file type. Use jpg, jpeg, png, webp or gif.");
  }
  return uploadFile(file, onProgress);
}
