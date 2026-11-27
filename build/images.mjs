/* ============================================================
   그림 크기 읽기

   Notion 에서 그림 크기를 줄여도 **API 는 그 값을 주지 않습니다.**
   (마크다운에도, 블록 객체에도 너비가 없습니다.) 그래서 "원래 화면에서
   보이던 크기" 를 그림 파일에서 직접 읽습니다.

   맥 스크린샷은 레티나라서 화면에 보이던 것보다 픽셀이 두 배입니다.
   그대로 그리면 전부 본문 폭까지 늘어나 같은 크기로 보입니다. 파일에
   적힌 해상도(PNG 의 pHYs, JPEG 의 JFIF 밀도)가 144dpi 면 반으로
   나눠서, 찍었던 화면에서의 크기로 되돌립니다.

   의존성 없이 헤더만 읽습니다. 못 읽으면 null 입니다.
   ============================================================ */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;

/* 픽셀 크기와 dpi. dpi 를 모르면 72 로 둡니다. */
export function imageInfo(buf) {
  try {
    // PNG — IHDR 다음, 그림 데이터(IDAT) 전에 오는 pHYs 를 찾습니다.
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      let dpi = 72;
      let i = 8;
      while (i + 8 <= buf.length) {
        const len = buf.readUInt32BE(i);
        const type = buf.toString("latin1", i + 4, i + 8);
        if (type === "IDAT" || type === "IEND") break;
        // 단위가 1(미터)일 때만 dpi 로 바꿀 수 있습니다.
        if (type === "pHYs" && len >= 9 && buf[i + 16] === 1) {
          dpi = buf.readUInt32BE(i + 8) * 0.0254;
        }
        i += 12 + len;
      }
      return { w, h, dpi };
    }

    // GIF
    if (buf.length > 10 && buf.toString("latin1", 0, 3) === "GIF") {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), dpi: 72 };
    }

    // WebP (확장 헤더가 있는 것만)
    if (
      buf.length > 30 &&
      buf.toString("latin1", 0, 4) === "RIFF" &&
      buf.toString("latin1", 8, 12) === "WEBP" &&
      buf.toString("latin1", 12, 16) === "VP8X"
    ) {
      return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), dpi: 72 };
    }

    // JPEG — JFIF 밀도(APP0)를 보고, 프레임 시작(SOF)에서 크기를 읽습니다.
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let dpi = 72;
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xe0 && buf.toString("latin1", i + 4, i + 9) === "JFIF\0") {
          const unit = buf[i + 11];
          const x = buf.readUInt16BE(i + 12);
          if (unit === 1 && x) dpi = x;            // 인치당
          else if (unit === 2 && x) dpi = x * 2.54; // 센티미터당
        }
        const isSOF =
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), dpi };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return null;
}

/* 화면에 그릴 크기(CSS 픽셀).

   144dpi 이상만 레티나로 봅니다. 윈도 스크린샷은 96dpi 로 찍히는데,
   그걸 1.33 으로 나누면 오히려 원래보다 작아집니다. */
export function displaySize(info) {
  if (!info || !info.w || !info.h) return null;
  const scale = info.dpi >= 144 - 1 ? Math.round(info.dpi / 72) : 1;
  return { w: Math.round(info.w / scale), h: Math.round(info.h / scale) };
}

/* 글 폴더 안의 그림을 모두 읽어 { "파일이름": { w, h } } 로 돌려줍니다.
   마크다운의 ![](파일이름) 과 바로 맞춰 볼 수 있는 모양입니다. */
export async function readImageSizes(dir) {
  const out = {};
  if (!dir) return out;
  for (const name of await readdir(dir)) {
    if (!IMG_EXT.test(name)) continue;
    const size = displaySize(imageInfo(await readFile(path.join(dir, name))));
    if (size) out[name] = size;
  }
  return out;
}
