import { CSSUnit } from "./css-unit";

export type Alignment = "between" | "around" | "start" | "center" | "end";

export type AlignmentStyles = {
    mainAxisAlignment: Alignment;
    crossAxisAlignment: Alignment;
};

export type Dimension = [number, CSSUnit];

/**
 * All numeric values in pixels
 */
export type ElementSchemaBaseStyles = Partial<{
    width: Dimension;
    height: Dimension;
    backgroundColor: string;
    borderColor: string;
    padding: Dimension;
    borderType: "solid" | "dotted";
    borderWidth: Dimension;
    borderRadius: Dimension;
    overflow: "visible" | "hidden" | "clip" | "scroll" | "auto";
    pointerEvents: "auto" | "none";
}>;

export type ElementSchemaStyles = ElementSchemaBaseStyles & {
    hover?: ElementSchemaBaseStyles;
};

export type FontWeight = "normal" | "medium" | "semibold" | "bold";

export type DomElementSchema =
    | {
          type: "button";
          children?: DomElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles;
      }
    | {
          type: "box";
          children?: DomElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles;
      }
    | {
          type: "grid";
          children?: DomElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles &
              Partial<{
                  columns: number;
                  gap: number;
              }>;
      }
    | {
          type: "column" | "row";
          children?: DomElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles &
              Partial<
                  {
                      gap: number;
                  } & AlignmentStyles
              >;
      }
    | {
          type: "text";
          child: string;
          domId?: string;
          styles?: ElementSchemaStyles &
              Partial<{
                  color: string;
                  fontSize: Dimension;
                  fontWeight: FontWeight;
                  textAlign: "start" | "center" | "end";
              }>;
      }
    | {
          type: "image";
          // url string of the image. can be svg
          child: string;
          domId?: string;
          styles?: ElementSchemaStyles;
      };
