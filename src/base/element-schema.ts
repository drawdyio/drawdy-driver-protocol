import { CSSUnit } from "./css-unit";

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

export type UpdateableProperties = Partial<{
    meta: Record<string, unknown>;
    locked: boolean;
    localTransform: {
        x: number;
        y: number;
        scale: number;
        /**
         * This is applied on top of the element's starting rotation.
         */
        rotation: number;
    };
}>;

export type SubscribedDrawdyElement = DrawdyElement &
    Partial<SubscribeableProperties>;

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
}>;

export type ElementSchemaStyles = ElementSchemaBaseStyles & {
    hover?: ElementSchemaBaseStyles;
};

export type FontWeight = "normal" | "medium" | "semibold" | "bold";

export type ElementSchema =
    | {
          type: "button";
          children?: ElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles;
      }
    | {
          type: "box";
          children?: ElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles;
      }
    | {
          type: "grid";
          children?: ElementSchema[];
          domId?: string;
          styles?: ElementSchemaStyles &
              Partial<{
                  columns: number;
                  gap: number;
              }>;
      }
    | {
          type: "column" | "row";
          children?: ElementSchema[];
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
