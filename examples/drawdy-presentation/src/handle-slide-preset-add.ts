import { DriverCommandIssuer, DrawdyElementSchema } from "@drawdy/driver-protocol";
import { pickerDomId } from "./handle-slide-preset-open";
import { buildSlideContent, SLIDE_HEIGHT, SLIDE_WIDTH } from "./slide-layouts";

const SLIDE_GAP = 160;

/**
 * A preset card was picked: add the slide to the board — a frame tagged with
 * its deck order plus the preset's content — then dismiss the picker and fly
 * the camera to the new slide.
 */
export async function handleSlidePresetAdd({
    presetId,
    slideOrder,
    issueCommand,
    driverId,
    generateId,
    requestId,
}: {
    presetId: string;
    /** 1-based position in the deck; also drives physical placement. */
    slideOrder: number;
    issueCommand: DriverCommandIssuer;
    driverId: string;
    generateId: () => string;
    requestId: {
        getAndBump(): number;
    };
}) {
    // POC placement: slides march right in deck order.
    const origin = { x: (slideOrder - 1) * (SLIDE_WIDTH + SLIDE_GAP), y: 0 };

    const frameId = generateId();
    const frame: DrawdyElementSchema = {
        type: "frame",
        drawdyElementId: frameId,
        position: [origin.x, origin.y],
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        rotation: 0,
        // Marks the frame as one of this extension's slides and remembers
        // its place in the deck.
        meta: { extensionSlideOrder: slideOrder },
    };

    const { res: addRes } = await issueCommand({
        driverId,
        type: "command:scene:add-drawdy-elements",
        req: {
            elements: [
                frame,
                ...buildSlideContent(presetId, origin, generateId),
            ],
        },
        requestId: String(requestId.getAndBump()),
    });
    if (addRes.error != null) {
        console.error(`Can't add slide elements, error: ${addRes.error}`);
        return;
    }

    // The slide is placed; the picker's job is done.
    await issueCommand({
        driverId,
        type: "command:dom:remove-floating-element",
        req: { domId: pickerDomId(driverId) },
        requestId: String(requestId.getAndBump()),
    });

    await issueCommand({
        driverId,
        type: "command:camera:fly-to-elements",
        req: {
            drawdyElementIds: [frameId],
            flyDurationMs: 500,
            zoom: 0.5,
        },
        requestId: String(requestId.getAndBump()),
    });
}
