import { DrawdyElementCommon, StrokeDash } from "./common";

export type LineBinding = {
    drawdyElementId: string;
    anchorX: number;
    anchorY: number;
};

/**
 * Either bind to an element or a position on the canvas. Never both
 */
type LineStart =
    | { from: [number, number]; startBinding?: never }
    | { from?: never; startBinding: LineBinding };

/**
 * Either bind to an element or a position on the canvas. Never both
 */
type LineEnd =
    | { to: [number, number]; endBinding?: never }
    | { to?: never; endBinding: LineBinding };

export type LineSchema =
    | (DrawdyElementCommon & {
          type: "line";
          bend?: Array<[number, number]>;
          elbowRouting?: boolean;
          color: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
      } & LineStart &
          LineEnd)
    | (DrawdyElementCommon & {
          type: "arrow";
          bend?: Array<[number, number]>;
          elbowRouting?: boolean;
          color: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
      } & LineStart &
          LineEnd);
