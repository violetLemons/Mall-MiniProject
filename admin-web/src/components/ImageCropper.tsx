import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { getCroppedBlob } from '../utils/image';

interface AreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  src: string;
  aspect?: number;
  mimeType?: string;
  cropShape?: 'rect' | 'round';
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export function ImageCropper({ src, aspect, mimeType, cropShape = 'rect', onConfirm, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<AreaPixels | null>(null);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!areaPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(src, areaPixels, mimeType);
      onConfirm(blob);
    } catch {
      onCancel();
    }
  };

  const btnBase: CSSProperties = {
    padding: '8px 18px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    backgroundColor: '#FFF',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000000, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(92vw, 520px)', backgroundColor: '#FFF', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', fontSize: '15px', fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>
          裁剪图片
        </div>

        <div style={{ position: 'relative', width: '100%', height: '340px', backgroundColor: '#0F172A' }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape !== 'round'}
            objectFit={cropShape === 'round' ? 'cover' : 'contain'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, area) => setAreaPixels(area)}
          />
        </div>

        <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#64748B', flexShrink: 0 }}>缩放</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ padding: '0 18px 16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ ...btnBase, opacity: busy ? 0.6 : 1 }}>取消</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            style={{ ...btnBase, backgroundColor: '#FF5500', borderColor: '#FF5500', color: '#FFF', opacity: busy ? 0.6 : 1 }}
          >
            确认裁剪
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export type CropResult = Blob | null;

export function useImageCropper() {
  const [state, setState] = useState<{ src: string; aspect?: number; mimeType?: string; cropShape?: 'rect' | 'round'; resolve?: (r: CropResult) => void } | null>(null);

  const openCrop = (src: string, aspect?: number, mimeType?: string, cropShape?: 'rect' | 'round'): Promise<CropResult> => {
    return new Promise((resolve) => setState({ src, aspect, mimeType, cropShape, resolve }));
  };

  const close = (r: CropResult) => {
    state?.resolve?.(r);
    setState(null);
  };

  const cropper = state ? (
    <ImageCropper
      src={state.src}
      aspect={state.aspect}
      mimeType={state.mimeType}
      cropShape={state.cropShape}
      onConfirm={(blob) => close(blob)}
      onCancel={() => close(null)}
    />
  ) : null;

  return { openCrop, cropper };
}
