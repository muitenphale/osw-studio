import type { ShellEnv, ShellResult } from '../types';
import { ensureDirectory, normalizePath } from '../runtime';

/** `generate-image` — generate an image into the project. */
export async function generateimageCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, ctx } = env;

  // Generate an image with the project's image model and save it to the VFS.
  // Usage: generate-image [--out <path>] [--aspect <ratio>] [--size <0.5K|1K|2K|4K>] "<prompt>"
  if (!ctx?.generateImage) {
    return { stdout: '', stderr: "generate-image: no image-generation model is configured for this project. Set one under the project's models.", exitCode: 1 };
  }
  let outPath: string | undefined;
  let aspectRatio: string | undefined;
  let imageSize: string | undefined;
  const promptParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out' || a === '-o') outPath = args[++i];
    else if (a === '--aspect' || a === '--aspect-ratio') aspectRatio = args[++i];
    else if (a === '--size') imageSize = args[++i];
    else promptParts.push(a);
  }
  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    return { stdout: '', stderr: 'Usage: generate-image [--out <path>] [--aspect <ratio>] [--size <0.5K|1K|2K|4K>] "<prompt>"', exitCode: 1 };
  }
  let image: { base64: string; mimeType: string };
  try {
    image = await ctx.generateImage(prompt, { aspectRatio, imageSize });
  } catch (err) {
    return { stdout: '', stderr: `generate-image: ${err instanceof Error ? err.message : 'generation failed'}`, exitCode: 1 };
  }
  // Decode base64 to bytes (works in both browser and Node).
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = (image.mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('+xml', '');
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  const target = outPath
    ? (normalizePath(outPath) || outPath)
    : `/.generated/${slug}-${Date.now().toString(36).slice(-5)}.${ext}`;
  const dirPath = target.slice(0, target.lastIndexOf('/')) || '/';
  if (dirPath !== '/') await ensureDirectory(vfs, projectId, dirPath);
  try {
    await vfs.createFile(projectId, target, bytes.buffer as ArrayBuffer);
  } catch {
    await vfs.updateFile(projectId, target, bytes.buffer as ArrayBuffer);
  }
  const detail = [aspectRatio && `aspect ${aspectRatio}`, imageSize && `size ${imageSize}`].filter(Boolean).join(', ');
  const note = outPath ? '' : ' (/.generated/ is excluded from the published build; pass --out <path> to save into the site).';
  return {
    stdout: `Generated image saved to ${target} (${bytes.length} bytes${detail ? `, ${detail}` : ''}).${note}`,
    stderr: '',
    exitCode: 0,
  };
}
