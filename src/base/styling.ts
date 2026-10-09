export type DeprecatedModuleStyling = {
    /** @deprecated Use `tokens["--dd-surface-panel"]`. */
    background: string;
    /** @deprecated Use `tokens["--dd-text-primary"]`. */
    foreground: string;
    /** @deprecated Use `tokens["--dd-surface-panel"]`. */
    surface: string;
    /** @deprecated Use `tokens["--dd-surface-section"]`. */
    surface2: string;
    /** @deprecated Use `tokens["--dd-text-secondary"]`. */
    mutedForeground: string;
    /** @deprecated Use `tokens["--dd-accent"]`. */
    primary: string;
    /** @deprecated Use `tokens["--dd-on-accent"]`. */
    primaryForeground: string;
    /** @deprecated Use `tokens["--dd-accent-text"]`. */
    accent: string;
    /** @deprecated Use `tokens["--dd-on-accent"]`. */
    accentForeground: string;
    /** @deprecated Use `tokens["--dd-border-medium"]`. */
    border: string;
    /** @deprecated Use `tokens["--dd-border-strong"]`. */
    input: string;
    /** @deprecated Use `tokens["--dd-focus-ring"]`. */
    ring: string;
    /** @deprecated Use `tokens["--dd-status-danger"]`. */
    destructive: string;
    /** @deprecated Use `tokens["--dd-status-success"]`. */
    success: string;
    /** @deprecated Use `tokens["--dd-status-warning"]`. */
    warning: string;
    /** @deprecated Use `tokens["--dd-radius-sm"]`. */
    radiusSm: string;
    /** @deprecated Use `tokens["--dd-radius-md"]`. */
    radiusMd: string;
    /** @deprecated Use `tokens["--dd-radius-lg"]`. */
    radiusLg: string;
};

/**
 * Map of property name to css variable name.
 *
 * This later changes via events:dom:theme-changed.
 *
 * for example, `{background: "black", radiusSm: "2px", ...}`
 */
export type ModuleStyling = DeprecatedModuleStyling & {
    theme: "dark" | "light";
    tokens: DrawdyThemeTokens;
};

export type DrawdyColorToken =
    | "--dd-surface-panel"
    | "--dd-surface-section"
    | "--dd-surface-elevated"
    | "--dd-surface-overlay"
    | "--dd-surface-tooltip"
    | "--dd-text-primary"
    | "--dd-text-secondary"
    | "--dd-text-tertiary"
    | "--dd-text-disabled"
    | "--dd-icon-disabled"
    | "--dd-border-subtle"
    | "--dd-border-medium"
    | "--dd-border-strong"
    | "--dd-divider"
    | "--dd-divider-strong"
    | "--dd-interaction-subtle"
    | "--dd-interaction-hover"
    | "--dd-interaction-pressed"
    | "--dd-interaction-active"
    | "--dd-interaction-disabled"
    | "--dd-focus-ring"
    | "--dd-control-surface-subtle"
    | "--dd-control-surface"
    | "--dd-status-info"
    | "--dd-status-info-subtle"
    | "--dd-status-success"
    | "--dd-status-success-subtle"
    | "--dd-status-warning"
    | "--dd-status-warning-subtle"
    | "--dd-status-danger"
    | "--dd-status-danger-subtle"
    | "--dd-accent"
    | "--dd-accent-hover"
    | "--dd-accent-pressed"
    | "--dd-accent-subtle"
    | "--dd-accent-text"
    | "--dd-on-accent";

export type DrawdyTypeStyle = "heading" | "label" | "body" | "caption";

export type DrawdyTypographyToken =
    | `--dd-type-${DrawdyTypeStyle}-${"size" | "line" | "weight"}`
    | "--dd-font-sans"
    | "--dd-font-mono";

export type DrawdySpaceToken = `--dd-space-${2 | 4 | 6 | 8 | 12 | 16 | 24}`;

export type DrawdySizeToken =
    | "--dd-control-xs"
    | "--dd-control-sm"
    | "--dd-control-md"
    | "--dd-icon-sm"
    | "--dd-icon-md";

export type DrawdyRadiusToken =
    "--dd-radius-sm" | "--dd-radius-md" | "--dd-radius-lg" | "--dd-radius-full";

export type DrawdyThemeToken =
    | DrawdyColorToken
    | DrawdyTypographyToken
    | DrawdySpaceToken
    | DrawdySizeToken
    | DrawdyRadiusToken;

export type DrawdyThemeTokens = Record<DrawdyThemeToken, string>;
