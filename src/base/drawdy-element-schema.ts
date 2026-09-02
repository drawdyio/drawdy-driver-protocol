import { DomElementSchema } from "./dom-element-schema";

export type DrawdyElement = { id: string };

export type SubscribeableProperties = {
    type: string;
    componentType: string;
    meta: Record<string, unknown>;
    locked: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    points: [number, number][];
    rotation: number;
    text: string;
};

export type SubscribeableKey = keyof SubscribeableProperties;

export type AnimatedProp<T> = T[];

export type LocalAnimationTransform = Partial<{
    x: AnimatedProp<number>;
    y: AnimatedProp<number>;
    width: AnimatedProp<number>;
    height: AnimatedProp<number>;
    rotation: AnimatedProp<number>;
    opacity: AnimatedProp<number>;
}>;

export type LocalAnimation = {
    time: {
        durationMs: number;
        curve: "linear" | "ease-in-out";
        repeat: "none" | "ping-pong";
    };
    animation: {
        transform: LocalAnimationTransform;
        curve: "linear" | "catmull";
    };
};

export type UpdateableProperties = Partial<{
    meta: Record<string, unknown>;
    locked: boolean;
    localAnimation: LocalAnimation | null;
}>;

export type SubscribedDrawdyElement = DrawdyElement &
    Partial<SubscribeableProperties>;

export type StrokeDash = "solid" | "dashed" | "dotted";

export type TextAlign = "left" | "center" | "right";

type DrawdyElementCommon = {
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
          LineEnd)
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
