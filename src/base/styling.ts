// just using map so typescript can help us check there are no duplicate keys.
const stylingVariables = {
    background: 0,
    foreground: 0,
    surface: 0,
    surface2: 0,
    mutedForeground: 0,
    primary: 0,
    primaryForeground: 0,
    accent: 0,
    accentForeground: 0,
    border: 0,
    input: 0,
    ring: 0,
    destructive: 0,
    success: 0,
    warning: 0,
    radiusSm: 0,
    radiusMd: 0,
    radiusLg: 0,
};

/**
 * Map of property name to css variable name.
 *
 * This later changes via events:dom:theme-changed.
 *
 * for example, `{background: "black", radiusSm: "2px", ...}`
 */
export type ModuleStyling = Record<keyof typeof stylingVariables, string> & {
    theme: "dark" | "light";
};
