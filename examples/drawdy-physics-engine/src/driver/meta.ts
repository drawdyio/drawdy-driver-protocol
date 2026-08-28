import { SubscribedDrawdyElement } from "@drawdy/driver-protocol";

export type PhysicsMode = "static" | "dynamic" | "none";

/** Shape kinds eligible for Dynamic simulation. */
export const DYNAMIC_COMPONENT_TYPES = new Set(["rect", "circle", "diamond"]);

export function physicsMode(el: SubscribedDrawdyElement): PhysicsMode {
    const physics = el.meta?.["physics"];
    if (physics && typeof physics === "object") {
        const mode = (physics as Record<string, unknown>)["mode"];
        if (mode === "static" || mode === "dynamic") return mode;
    }
    return "none";
}

export function isDynamicEligible(el: SubscribedDrawdyElement): boolean {
    return (
        DYNAMIC_COMPONENT_TYPES.has(el.componentType ?? "") &&
        el.locked !== true
    );
}
