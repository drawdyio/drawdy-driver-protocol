import { DomElementSchema } from "../dom-element-schema";
import { DrawdyElementCommon, StrokeDash, TextAlign } from "./common";
import { LineSchema } from "./line";

export * from "./common";
export * from "./line";

export type DrawdyElementSchema =
    | (DrawdyElementCommon & {
          type: "frame";
          position: [number, number];
          width: number;
          height: number;
          rotation: number;
          meta: Record<string, any>;
      })
    | (DrawdyElementCommon & {
          type: "freedraw";
          points: number[];
          width: number;
          height: number;
          meta: Record<string, any>;
      })
    | (DrawdyElementCommon & {
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
    | LineSchema
    | (DrawdyElementCommon & {
          type: "image";
          url: string;
          x: number;
          y: number;
          width: number;
          height: number;
      })
    | (DrawdyElementCommon & {
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
      })
    | (Omit<DrawdyElementCommon, "layer"> & {
          type: "component";
          x: number;
          y: number;
          width: number;
          height: number;
          schema: DomElementSchema;
      });
