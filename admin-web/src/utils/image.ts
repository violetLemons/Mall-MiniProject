export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 前端压缩图片到指定最长边，规避网关 2MB 请求体上限。
 * 透明图标用 png，营销大图/照片用 jpeg 更省体积。
 */
export async function compressImage(file: File, maxEdge = 240, mimeType = 'image/png'): Promise<File> {
  try {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType));
    if (!blob) return file;
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: mimeType });
  } catch {
    return file;
  }
}
