export type DrawdyElement = { id: string };

export type LineBinding = {
    drawdyElementId: string;
    anchorX: number;
    anchorY: number;
};

export interface SubscribeableProperties extends ElementStyle {
    type: string;
    componentType: string;
    meta: Record<string, unknown>;
    locked: boolean;
    groupId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    points: [number, number][];
    rotation: number;
    text: string;
    startBinding: LineBinding;
    endBinding: LineBinding;
}

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

export type UpdateableProperties = ElementStyle &
    Partial<{
        meta: Record<string, unknown>;
        locked: boolean;
        groupId: string | null;
        localAnimation: LocalAnimation | null;
    }>;

export type SubscribedDrawdyElement = DrawdyElement &
    Partial<SubscribeableProperties>;

export type StrokeDash = "solid" | "dashed" | "dotted";

export type TextAlign = "left" | "center" | "right";

export type FillStyle = "solid" | "hachure" | "cross-hatch";

export type ElementStyle = {
    layer?: number;
    strokeColor?: string;
    textColor?: string;
    fillColor?: string;
    strokeWidth?: number;
    lineStrokeWidth?: number;
    opacity?: number;
    cornerRadius?: number;
    strokeDash?: StrokeDash;
    fillStyle?: FillStyle;
    seed?: number;
    roughness?: number;
};

export interface DrawdyElementCommon extends ElementStyle {
    drawdyElementId: string;
    meta?: Record<string, any>;
    groupId?: string;
}
