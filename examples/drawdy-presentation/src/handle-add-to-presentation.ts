import { DriverCommandIssuer, DriverElement } from "@drawdy/driver-protocol";

/** Breathing room between the selection's combined rect and the frame edge. */
const FRAME_PADDING = 48;

/**
 * The "Add to presentation" context menu was clicked: wrap the current
 * selection in a slide frame. Returns true when a slide was added.
 */
export async function handleAddToPresentation({
    slideOrder,
    issueCommand,
    driverId,
    generateId,
    requestId,
}: {
    /** 1-based position in the deck for the new slide. */
    slideOrder: number;
    issueCommand: DriverCommandIssuer;
    driverId: string;
    generateId: () => string;
    requestId: {
        getAndBump(): number;
    };
}): Promise<boolean> {
    const selected = await issueCommand({
        driverId,
        type: "command:scene:get-selected-ids",
        requestId: String(requestId.getAndBump()),
    });
    if (selected.res.error != null) {
        console.error(`Can't read selection, error: ${selected.res.error}`);
        return false;
    }
    const { drawdyElementIds } = selected.res.value;
    if (drawdyElementIds.length === 0) {
        return false;
    }

    const combined = await issueCommand({
        driverId,
        type: "command:scene:query-combined-rect",
        req: { drawdyElementIds },
        requestId: String(requestId.getAndBump()),
    });
    if (combined.res.error != null) {
        console.error(
            `Can't query combined rect, error: ${combined.res.error}`
        );
        return false;
    }
    const { rect } = combined.res.value;
    if (!rect) {
        return false;
    }

    const frame: DriverElement = {
        type: "frame",
        drawdyElementId: generateId(),
        position: [rect.x - FRAME_PADDING, rect.y - FRAME_PADDING],
        width: rect.width + FRAME_PADDING * 2,
        height: rect.height + FRAME_PADDING * 2,
        rotation: 0,
        meta: { extensionSlideOrder: slideOrder },
    };
    const { res: addRes } = await issueCommand({
        driverId,
        type: "command:scene:add-drawdy-elements",
        req: { elements: [frame] },
        requestId: String(requestId.getAndBump()),
    });
    if (addRes.error != null) {
        console.error(`Can't add slide frame, error: ${addRes.error}`);
        return false;
    }
    return true;
}
