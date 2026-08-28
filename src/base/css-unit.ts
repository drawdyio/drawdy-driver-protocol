export type CSSAbsoluteUnit = "px" | "pt" | "pc" | "in" | "cm" | "mm" | "Q";

export type CSSFontUnit =
    | "em"
    | "rem"
    | "ex"
    | "rex"
    | "cap"
    | "rcap"
    | "ch"
    | "rch"
    | "ic"
    | "ric"
    | "lh"
    | "rlh";

export type CSSViewportUnit =
    // Default / Legacy Viewport
    | "vw"
    | "vh"
    | "vmin"
    | "vmax"
    // Small Viewport
    | "svw"
    | "svh"
    | "svmin"
    | "svmax"
    // Large Viewport
    | "lvw"
    | "lvh"
    | "lvmin"
    | "lvmax"
    // Dynamic Viewport
    | "dvw"
    | "dvh"
    | "dvmin"
    | "dvmax"
    // Container Query Units
    | "cqw"
    | "cqh"
    | "cqi"
    | "cqb"
    | "cqmin"
    | "cqmax";

export type CSSAngleUnit = "deg" | "grad" | "rad" | "turn";

export type CSSTimeUnit = "s" | "ms";

export type CSSFrequencyUnit = "Hz" | "kHz";

export type CSSResolutionUnit = "dpi" | "dpcm" | "dppx" | "x";

export type CSSOtherUnit = "%" | "fr" | "st";

// -----------------------------------------------------------------------------
// 2. Combined Unit Unions
// -----------------------------------------------------------------------------

export type CSSLengthUnit = CSSAbsoluteUnit | CSSFontUnit | CSSViewportUnit;

export type CSSUnit =
    | CSSLengthUnit
    | CSSAngleUnit
    | CSSTimeUnit
    | CSSFrequencyUnit
    | CSSResolutionUnit
    | CSSOtherUnit;
