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

export type DrawdyElementCommon = {
    drawdyElementId: string;
    layer?: number;
    meta?: Record<string, any>;
};
