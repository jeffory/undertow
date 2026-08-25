// Intent — the resolved movement/action request that input.ts fills and the
// boat/foot controllers consume (plan 01 §2.2, task 5). Plain data only.

export interface Intent {
  moveX: number; // -1..1 horizontal
  moveY: number; // -1..1 vertical (screen/world axes resolved by controller)
  // Actions (0/1 booleans):
  primary: boolean; // gaff light (LMB tap / combo advance)
  secondary: boolean; // reel stance / gaff heavy hold (RMB)
  dodge: boolean; // space — dodge roll
  cast: boolean; // cast / SET (reserved, 03)
  cut: boolean; // hold F — cut line (reserved, 02)
  lure1: boolean;
  lure2: boolean;
  lure3: boolean;
  aimX: number; // world-space aim direction x (reserved)
  aimY: number;
}

export function createIntent(): Intent {
  return {
    moveX: 0,
    moveY: 0,
    primary: false,
    secondary: false,
    dodge: false,
    cast: false,
    cut: false,
    lure1: false,
    lure2: false,
    lure3: false,
    aimX: 0,
    aimY: 1,
  };
}
