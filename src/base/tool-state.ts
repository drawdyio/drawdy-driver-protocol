import { StrokeDash, TextAlign } from "./driver-element";

export type ToolStyleState =
    | {
          toolId: "text";
          fontSize: number;
          color: string;
          textAlign?: TextAlign;
          opacity?: number;
      }
    | {
          toolId: "eraser";
          size: number;
      }
    | {
          toolId: "rect" | "circle" | "diamond";
          strokeColor: string;
          fillColor?: string;
          strokeWidth: number;
          strokeDash?: StrokeDash;
          cornerRadius?: number;
          opacity?: number;
      }
    | {
          toolId: "line" | "arrow";
          strokeColor: string;
          strokeWidth: number;
          strokeDash?: StrokeDash;
          opacity?: number;
      }
    | {
          toolId: "pencil";
          strokeColor: string;
          strokeWidth: number;
          opacity?: number;
      }
    | {
          toolId: "laser-pointer";
          color: string;
          fadeDuration?: number;
      };

/** The `toolId`s that {@link ToolStyleState} covers. */
export type StyleableToolId = ToolStyleState["toolId"];

export type ToolId =
    | "select"
    | "drag"
    | "pencil"
    | "eraser"
    | "line"
    | "arrow"
    | "text"
    | "rect"
    | "circle"
    | "diamond"
    | "image"
    | "laser-pointer";

type AssertStyleableAreTools =
    ToolStyleState["toolId"] extends ToolId ? true : never;
