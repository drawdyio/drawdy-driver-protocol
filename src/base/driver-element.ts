export type StrokeDash = "solid" | "dashed" | "dotted";

export type TextAlign = "left" | "center" | "right";

type DriverElementCommon = {
    drawdyElementId: string;
    layer?: number;
    meta?: Record<string, any>;
};

export type DriverElement =
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
          from: [number, number];
          to: [number, number];
          /**
           * Curve the line through one control point (quadratic) or several
           * (through every bend, in order).
           */
          bend?: [number, number] | [number, number][];
          color: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
      })
    | (DriverElementCommon & {
          type: "arrow";
          from: [number, number];
          to: [number, number];
          /** Curve the shaft through one control point. */
          bend?: [number, number];
          color: string;
          strokeWidth?: number;
          strokeDash?: StrokeDash;
      })
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
