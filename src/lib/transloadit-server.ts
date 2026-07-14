// Server-side Transloadit helpers: signed params for browser uploads,
// and a direct buffer upload used inside the Crop Image Trigger.dev task.
import { Transloadit } from "transloadit";

function client(): Transloadit {
  const authKey = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY;
  const authSecret = process.env.TRANSLOADIT_SECRET;
  if (!authKey || !authSecret) {
    throw new Error("Transloadit credentials are not configured.");
  }
  return new Transloadit({ authKey, authSecret });
}

const IMAGE_STORE_STEPS = {
  ":original": { robot: "/upload/handle" },
} as const;

/** Signed params + signature for a direct-from-browser image upload. */
export function signedUploadParams(): {
  params: string;
  signature: string;
  url: string;
} {
  const c = client();
  const templateId = process.env.TRANSLOADIT_TEMPLATE_ID;
  // Pass the params OBJECT; calcSignature injects `auth` (key + expires) and
  // returns the canonical params STRING the signature was computed over. The
  // client must send back that exact string, or the signature won't match.
  const paramsObj: Record<string, unknown> = templateId
    ? { template_id: templateId }
    : { steps: IMAGE_STORE_STEPS };

  const { signature, params } = c.calcSignature(paramsObj);

  return { params, signature, url: "https://api2.transloadit.com/assemblies" };
}

/** Upload a buffer to Transloadit and return a hosted URL. */
export async function uploadBuffer(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const c = client();
  const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "nf-"));
  const filePath = join(dir, filename);
  try {
    await writeFile(filePath, buffer);
    const result = await c.createAssembly({
      files: { file: filePath },
      params: { steps: IMAGE_STORE_STEPS },
      waitForCompletion: true,
    });
    const uploads = (result.uploads ?? []) as Array<{ ssl_url: string }>;
    const results = (result.results ?? {}) as Record<
      string,
      Array<{ ssl_url: string }>
    >;
    const fromResults = Object.values(results)[0]?.[0]?.ssl_url;
    const url = fromResults ?? uploads[0]?.ssl_url;
    if (!url) throw new Error("Transloadit returned no URL.");
    return url;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
