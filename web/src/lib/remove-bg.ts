/**
 * Background removal via remove.bg (https://www.remove.bg/api). A paid,
 * per-image external service — chosen over a local/free approach because
 * reliable background removal on arbitrary product photos needs a trained
 * segmentation model, not something worth hosting for this app's volume.
 */

const REMOVE_BG_ENDPOINT = "https://api.remove.bg/v1.0/removebg";

export class RemoveBgNotConfiguredError extends Error {
  constructor() {
    super("REMOVEBG_API_KEY is not set — add it to .env.local (and Vercel) before using auto background removal.");
    this.name = "RemoveBgNotConfiguredError";
  }
}

/** Sends the image to remove.bg and returns the cut-out PNG (transparent background). */
export async function removeBackground(file: Blob): Promise<Buffer> {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) throw new RemoveBgNotConfiguredError();

  const form = new FormData();
  form.set("image_file", file);
  form.set("size", "auto");

  const response = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`remove.bg request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
