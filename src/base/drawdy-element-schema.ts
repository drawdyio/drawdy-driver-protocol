export type StrokeDash = "solid" | "dashed" | "dotted";

export type TextAlign = "left" | "center" | "right";

type DriverElementCommon = {
    drawdyElementId: string;
    layer?: number;
    meta?: Record<string, any>;
};

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

export type DrawdyElementSchema =
    | (DriverElementCommon & {
          type: "frame";
          position: [number, number];
          width: number;
          height: number;
          rotation: number;
          meta: Record<string, any>;
      })
    | (DriverElementCommon & {
          type: "freedraw";
          points: number[];
          width: number;
          height: number;
          meta: Record<string, any>;
      })
    | (DriverElementCommon & {
          type: "shape";
          componentType?: "rect" | "circle" | "diamond";
          x: number;
          y: number;
          width: number;
          height: number;
          strokeColor: string;
          fillColor: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
          cornerRadius?: number;
          /** 0 = crisp, higher = sketchier. */
          roughness?: number;
          /** Label rendered inside the shape. */
          text?: string;
          fontSize?: number;
          textAlign?: TextAlign;
          textVerticalAlign?: "top" | "middle" | "bottom";
      })
    | (DriverElementCommon & {
          type: "line";
          bend?: Array<[number, number]>;
          elbowRouting?: boolean;
          color: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
      } & LineStart &
          LineEnd)
    | (DriverElementCommon & {
          type: "arrow";
          bend?: Array<[number, number]>;
          elbowRouting?: boolean;
          color: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
      } & LineStart &
          LineEnd)
    | (DriverElementCommon & {
          type: "image";
          url: string;
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (DriverElementCommon & {
          type: "text";
          x: number;
          y: number;
          /**
           * Width and height and be measured later.
           */
          width?: number;
          height?: number;
          text: string;
          fontSize: number;
          color: string;
          textAlign?: TextAlign;
      });
