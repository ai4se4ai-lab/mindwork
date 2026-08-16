// Mirrors desktop/src/upng-js.d.ts. user-web's tsconfig `include` only covers
// `src` (not `../desktop/src`), so `desktop/src/features/profile/lib/
// animatedAvatarCapture.ts`'s `import UPNG from "upng-js"` needs its own copy
// of this ambient declaration to typecheck when reached through user-web's
// program — TypeScript scopes ambient module declarations to the whole
// program, not to whichever project's `include` happened to name the file
// that declares them.
declare module "upng-js" {
  const UPNG: {
    /**
     * Encode RGBA frames as a (possibly animated) PNG.
     *
     * @param imgs - one RGBA8 ArrayBuffer per frame
     * @param cnum - color count for lossy quantization; 0 = lossless
     * @param dels - per-frame delays in milliseconds (animated when > 1 frame)
     */
    encode(
      imgs: ArrayBuffer[],
      width: number,
      height: number,
      cnum: number,
      dels?: number[],
    ): ArrayBuffer;
  };
  export default UPNG;
}
