// Mirrors desktop/src/types/qrcode.d.ts — see upng-js.d.ts in this directory
// for why user-web needs its own copy rather than relying on desktop's.
declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type BitMatrix = {
    get(row: number, column: number): number;
    size: number;
  };

  type QrCode = {
    modules: BitMatrix;
  };

  export function create(
    value: string,
    options?: { errorCorrectionLevel?: ErrorCorrectionLevel },
  ): QrCode;
}
