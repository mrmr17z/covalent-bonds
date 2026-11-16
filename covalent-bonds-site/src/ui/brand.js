// شعار الأمد: يُحمَّل مرة واحدة ثم يُرسم داخل لوحات Canvas ثلاثية الأبعاد
import { BRAND_FILES, assetUrl } from '../assetsManifest.js';

export const BRAND = { logo: null, logoLight: null };

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function loadBrand() {
  const [a, b] = await Promise.all([loadImage(assetUrl(BRAND_FILES.logo)), loadImage(assetUrl(BRAND_FILES.logoLight))]);
  BRAND.logo = a; BRAND.logoLight = b;
  return BRAND;
}

/** يرسم الشعار بارتفاع h (بكسل) ويعيد عرضه */
export function drawLogo(ctx, img, x, y, h) {
  if (!img) return 0;
  const w = (h * img.width) / img.height;
  ctx.drawImage(img, x, y, w, h);
  return w;
}
