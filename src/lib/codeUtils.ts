/**
 * 招待コードやランダムコード生成などのユーティリティを提供するモジュール。
 * - 主にペア招待コードの生成処理に使用される。
 */

/**
 * 英大文字と数字からなるランダムな招待コードを生成する。
 * - デフォルトは6文字のコードを生成。
 * - 文字セットは A〜Z および 0〜9 の36文字。
 *
 * @param length 生成するコードの文字数（省略時は 6 文字）
 * @returns 生成されたランダムな英数字コード
 */
export const generateInviteCode = (length = 6): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
