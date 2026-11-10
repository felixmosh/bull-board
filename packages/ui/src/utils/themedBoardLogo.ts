import type { BoardLogo, UIConfig } from '@bull-board/api/typings/app';

export function themedBoardLogo(
  boardLogo: UIConfig['boardLogo']
): { light: BoardLogo; dark?: BoardLogo } | undefined {
  if (!boardLogo) {
    return undefined;
  }
  return 'light' in boardLogo ? boardLogo : { light: boardLogo };
}
