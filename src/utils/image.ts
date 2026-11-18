const MAX_DATA_URL_LENGTH = 400000;

export function resizeImageToDataUrl(
  file: File,
  maxDimension = 720
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const tryEncode = (dim: number, qualities: number[]): string | null => {
          const scale = Math.min(1, dim / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0, width, height);
          for (const q of qualities) {
            const dataUrl = canvas.toDataURL('image/jpeg', q);
            if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
              return dataUrl;
            }
          }
          return null;
        };

        const firstPass = tryEncode(maxDimension, [0.78, 0.65, 0.52, 0.4]);
        if (firstPass) {
          resolve(firstPass);
          return;
        }

        const secondPass = tryEncode(
          Math.round(maxDimension * 0.72),
          [0.55, 0.42, 0.34]
        );
        if (secondPass) {
          resolve(secondPass);
          return;
        }

        reject(
          new Error(
            'Image is too large after compression. Please choose a smaller JPG or PNG.'
          )
        );
      };
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  });
}
