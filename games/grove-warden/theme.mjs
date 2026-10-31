// One shared, opaque palette for authored texels and combat rendering.
export const PALETTE = Object.freeze([
  null, '#302c3c', '#454052', '#5d5b6c', '#7b7d87', '#aaaca7', '#fff4d6', '#dfcc9e',
  '#f4c995', '#cc956d', '#514044', '#785443', '#a87848', '#76513b', '#95663d', '#b5834e',
  '#365547', '#5b8758', '#85ad55', '#c5d364', '#e0e990', '#344f54', '#568181', '#9bc3ad',
  '#4d597e', '#7e9fc1', '#b1cee0', '#796082', '#b394aa', '#cd776c', '#efa64f', '#ffe298',
]);
export const PIXEL_INDEX = Object.freeze({
  ink: 1, shade: 2, slate: 3, stone: 4, stoneLight: 5, cream: 6, linen: 7,
  skin: 8, skinShade: 9, woodDark: 10, wood: 11, woodLight: 12,
  dirtDark: 13, dirt: 14, dirtLight: 15, forest: 16, green: 17, leaf: 18,
  leafLight: 19, sunLeaf: 20, deepTeal: 21, teal: 22, mint: 23,
  navy: 24, blue: 25, sky: 26, violet: 27, lilac: 28, red: 29, orange: 30, gold: 31,
});
export const PIXEL_COLORS = Object.freeze(Object.fromEntries(
  Object.entries(PIXEL_INDEX).map(([name, index]) => [name, PALETTE[index]]),
));
