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
export async function compressImage(file: File, maxEdge = 240, mimeType = 'image/png', quality = 0.82): Promise<File> {
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
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, quality));
    if (!blob) return file;
    const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: mimeType });
  } catch {
    return file;
  }
}

export interface CropAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 按 react-easy-crop 给出的像素区域截取图片，返回 Blob。
 * 默认 JPEG（照片）；透明图标传 'image/png' 以保留透明通道。
 */
export async function getCroppedBlob(src: string, areaPixels: CropAreaPixels, mimeType = 'image/jpeg'): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(areaPixels.width));
  canvas.height = Math.max(1, Math.round(areaPixels.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建裁剪画布');
  ctx.drawImage(
    img,
    areaPixels.x,
    areaPixels.y,
    areaPixels.width,
    areaPixels.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.92));
  if (!blob) throw new Error('裁剪失败');
  return blob;
}

/** 把裁剪得到的 Blob 包成 File，扩展名跟随 mimeType */
export function blobToFile(blob: Blob, name: string, mimeType = 'image/jpeg'): File {
  const ext = mimeType === 'image/png' ? 'png' : (mimeType === 'image/webp' ? 'webp' : 'jpg');
  return new File([blob], name.replace(/\.[^.]+$/, '') + '.' + ext, { type: mimeType });
}
