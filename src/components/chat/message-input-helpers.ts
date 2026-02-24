export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
}

export interface ImageAttachment {
  path: string;       // absolute path on disk
  name: string;       // original filename
  previewUrl: string; // blob: URL for thumbnail
}

export const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

export const isSupportedImage = (file: File) => SUPPORTED_IMAGE_TYPES.has(file.type);
