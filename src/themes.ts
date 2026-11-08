/** Built-in palettes use local fonts; they require no network or project assets. */
export const themeIds = [
  "aurora",
  "paper",
  "ink",
  "ocean",
  "forest",
  "sand",
  "rose",
  "mono",
  "cobalt",
  "terminal",
] as const;
export type ThemeId = (typeof themeIds)[number];
export type ThemeOptions = {
  preset?: ThemeId;
  accent?: string;
  background?: string;
  color?: string;
  font?: string;
  material?: "glass" | "solid";
};
export type ThemeTokens = {
  accent: string;
  background: string;
  color: string;
  font: string;
  material: "glass" | "solid";
  muted: string;
  panel: string;
  surface: string;
  border: string;
  code: string;
  radius: number;
  glow: string;
  glowSecondary: string;
  dark: boolean;
};
export type ThemePreset = ThemeTokens & { id: ThemeId; label: string };
const sans = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
const serif = 'Georgia, "Songti SC", "Noto Serif CJK SC", serif';
function preset(
  id: ThemeId,
  label: string,
  colors: string[],
  font: string,
  material: "glass" | "solid",
  radius: number,
): ThemePreset {
  const [
    background,
    color,
    accent,
    muted,
    panel,
    surface,
    border,
    code,
    glow,
    glowSecondary,
  ] = colors;
  return {
    id,
    label,
    background,
    color,
    accent,
    muted,
    panel,
    surface,
    border,
    code,
    glow,
    glowSecondary,
    font,
    material,
    radius,
    dark: luminance(background) < 0.18,
  };
}
export const themePresets: ThemePreset[] = [
  preset(
    "aurora",
    "极光玻璃",
    [
      "#f6f8fc",
      "#17243c",
      "#4258b8",
      "#59657c",
      "#e8edf7",
      "#ffffff",
      "#cfd7ea",
      "#e4e9f3",
      "#9bc8ed",
      "#d9bde9",
    ],
    sans,
    "glass",
    28,
  ),
  preset(
    "paper",
    "学术纸张",
    [
      "#fbf7ee",
      "#302c27",
      "#8d452f",
      "#716457",
      "#eee6d8",
      "#fffdf7",
      "#d8cbbb",
      "#eae1d2",
      "#d8c5a6",
      "#e4d9bf",
    ],
    serif,
    "solid",
    3,
  ),
  preset(
    "ink",
    "墨色金线",
    [
      "#17191d",
      "#f1ede4",
      "#dec183",
      "#b5b1a8",
      "#282b31",
      "#1e2126",
      "#484747",
      "#101216",
      "#827253",
      "#444c64",
    ],
    serif,
    "solid",
    8,
  ),
  preset(
    "ocean",
    "深海玻璃",
    [
      "#0c2237",
      "#ecf6ff",
      "#78d7eb",
      "#a6c0d3",
      "#19374f",
      "#102b43",
      "#325872",
      "#081a2c",
      "#237fa3",
      "#28558c",
    ],
    sans,
    "glass",
    24,
  ),
  preset(
    "forest",
    "苔绿手札",
    [
      "#f1f5ef",
      "#23392c",
      "#326746",
      "#586e5e",
      "#e0e9dd",
      "#fafcf7",
      "#bdcfbc",
      "#dce6d8",
      "#afc5a0",
      "#cbd6ad",
    ],
    serif,
    "solid",
    16,
  ),
  preset(
    "sand",
    "砂岩陶土",
    [
      "#f9f0e6",
      "#453329",
      "#a1452f",
      "#7c6252",
      "#efdfce",
      "#fff8ef",
      "#d8beaa",
      "#e9d6c3",
      "#e0ac87",
      "#e8ccb1",
    ],
    sans,
    "solid",
    32,
  ),
  preset(
    "rose",
    "玫瑰雾面",
    [
      "#fcf4f7",
      "#432d40",
      "#9b416c",
      "#7a5c73",
      "#f0e1eb",
      "#fffafd",
      "#dfc4d6",
      "#ead9e5",
      "#d9a6cb",
      "#c7b9e7",
    ],
    sans,
    "glass",
    30,
  ),
  preset(
    "mono",
    "黑白极简",
    [
      "#ffffff",
      "#171717",
      "#333333",
      "#666666",
      "#f0f0f0",
      "#ffffff",
      "#cccccc",
      "#e8e8e8",
      "#bbbbbb",
      "#dddddd",
    ],
    sans,
    "solid",
    0,
  ),
  preset(
    "cobalt",
    "钴蓝汇报",
    [
      "#edf2fc",
      "#142951",
      "#204ac8",
      "#50648b",
      "#dce6fa",
      "#f8faff",
      "#b7c8e9",
      "#d6e1f7",
      "#8caee9",
      "#b9c9ef",
    ],
    sans,
    "solid",
    8,
  ),
  preset(
    "terminal",
    "终端网格",
    [
      "#111c19",
      "#e4f3e9",
      "#8eddb1",
      "#a0bbac",
      "#1e3029",
      "#16251f",
      "#365347",
      "#0b1511",
      "#3a775a",
      "#426a60",
    ],
    '"Courier New", "PingFang SC", monospace',
    "solid",
    2,
  ),
];
/** Relative luminance, also used to keep table headers readable with custom accents. */
export function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function mix(a: string, b: string, amount: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - amount) +
            parseInt(b.slice(i, i + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function resolveTheme(
  options: ThemeOptions = {},
  background?: string,
): ThemeTokens {
  const selected = themePresets.find((t) => t.id === options.preset);
  // Existing projects retain their original palette until a preset is selected.
  const base: ThemeTokens = selected || {
    accent: "#16766d",
    background: "#fafbf9",
    color: "#192c2a",
    font: "Arial, sans-serif",
    material: "solid",
    muted: "#71817e",
    panel: "#eef2ef",
    surface: "#ffffff",
    border: "#d8e4dc",
    code: "#e5ebe8",
    radius: 24,
    glow: "#a5b9ed",
    glowSecondary: "#eed7bb",
    dark: false,
  };
  const result = {
    ...base,
    ...Object.fromEntries(
      Object.entries(options).filter(([, v]) => v !== undefined),
    ),
    background: background || options.background || base.background,
  };
  result.dark = luminance(result.background) < 0.18;
  if (
    (background || options.background) &&
    result.background !== base.background
  ) {
    const contrast = result.dark ? "#ffffff" : "#000000";
    result.panel = mix(result.background, contrast, 0.07);
    result.surface = mix(result.background, contrast, 0.025);
    result.border = mix(result.background, contrast, 0.18);
    result.code = mix(result.background, contrast, 0.1);
    result.muted = mix(
      result.background,
      options.color || (result.dark ? "#ffffff" : "#192c2a"),
      0.66,
    );
  }
  return result;
}
export function headerText(accent: string): string {
  return luminance(accent) > 0.179 ? "#000000" : "#ffffff";
}
