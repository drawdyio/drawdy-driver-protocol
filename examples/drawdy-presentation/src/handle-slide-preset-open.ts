import {
    DriverCommandIssuer,
    ElementSchema,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { slidePresets, toDataUri } from "./slide-presets";

export function presetButtonId(driverId: string, presetId: string): string {
    return `${driverId}:preset:${presetId}`;
}

export function pickerDomId(driverId: string): string {
    return `${driverId}:slide-preset-picker`;
}

export function pickerCloseButtonId(driverId: string): string {
    return `${driverId}:slide-preset-picker:close`;
}

export async function handleSlidePresetOpen({
    webviewCursorPosition,
    issueCommand,
    driverId,
    requestId,
    webviewId,
    styling,
}: {
    webviewCursorPosition: { x: number; y: number };
    webviewId: string;
    issueCommand: DriverCommandIssuer;
    driverId: string;
    styling: ModuleStyling;
    requestId: {
        getAndBump(): number;
    };
}) {
    /**
    when plus clicked:
        iframe queries current window size
        iframe queries its own rect within that window
        iframe creates floating element at desired position based on the transformed cursor position from iframe space into window's space.
    */
    const { res: windowSize } = await issueCommand({
        driverId,
        type: "command:dom:window-size",
        requestId: String(requestId.getAndBump()),
    });
    if (windowSize.error != null) {
        console.error(`Can't query window size, error: ${windowSize.error}`);
        return;
    }
    const { res: webviewRect } = await issueCommand({
        driverId,
        type: "command:dom:element-rect",
        req: {
            elementId: webviewId,
        },
        requestId: String(requestId.getAndBump()),
    });
    if (webviewRect.error != null) {
        console.error(`Can't query webview rect, error: ${webviewRect.error}`);
        return;
    }

    const domCursorPosition = {
        x: Math.min(
            webviewCursorPosition.x + webviewRect.value.x,
            windowSize.value.width
        ),
        y: Math.min(
            webviewCursorPosition.y + webviewRect.value.y,
            windowSize.value.height
        ),
    };

    const { res: createRes } = await issueCommand({
        driverId,
        type: "command:dom:create-floating-element",
        req: {
            domId: pickerDomId(driverId),
            position: { x: domCursorPosition.x, y: domCursorPosition.y + 16 },
            schema: pickerSchema(driverId, styling),
            barrierDismissible: true,
        },
        requestId: String(requestId.getAndBump()),
    });
    if (createRes.error != null) {
        console.error(
            `Can't create floating element, error: ${createRes.error}`
        );
    }
}

function pickerSchema(driverId: string, styling: ModuleStyling): ElementSchema {
    const slides: ElementSchema[] = slidePresets(styling).map((preset) => ({
        type: "button",
        domId: presetButtonId(driverId, preset.id),
        styles: {
            backgroundColor: styling.background,
            borderColor: styling.border,
            borderRadius: [8, "px"],
            overflow: "hidden",
            hover: {
                borderColor: styling.primary,
            },
        },
        children: [
            {
                type: "column",
                styles: { gap: 0 },
                children: [
                    {
                        type: "image",
                        child: preset.preview,
                        styles: {
                            width: [100, "%"],
                            padding: [6, "px"],
                        },
                    },
                    {
                        type: "text",
                        child: preset.label,
                        styles: {
                            color: styling.mutedForeground,
                            fontSize: [11, "px"],
                            fontWeight: "medium",
                            textAlign: "center",
                            padding: [6, "px"],
                            backgroundColor: styling.surface2,
                        },
                    },
                ],
            },
        ],
    }));

    return {
        type: "box",
        styles: {
            width: [320, "px"],
            backgroundColor: styling.surface,
            borderColor: styling.border,
            borderRadius: [12, "px"],
            padding: [12, "px"],
        },
        children: [
            {
                type: "column",
                styles: { gap: 12 },
                children: [
                    {
                        type: "row",
                        styles: {
                            mainAxisAlignment: "between",
                            crossAxisAlignment: "center",
                        },
                        children: [
                            {
                                type: "text",
                                child: "Add a Slide",
                                styles: {
                                    color: styling.foreground,
                                    fontSize: [14, "px"],
                                    fontWeight: "semibold",
                                },
                            },
                            {
                                type: "button",
                                domId: pickerCloseButtonId(driverId),
                                styles: {
                                    padding: [4, "px"],
                                    borderRadius: [6, "px"],
                                    hover: {
                                        backgroundColor: styling.accent,
                                    },
                                },
                                children: [
                                    {
                                        type: "image",
                                        child: closeIcon(styling),
                                        styles: {
                                            width: [16, "px"],
                                            height: [16, "px"],
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        type: "grid",
                        styles: { columns: 2, gap: 8 },
                        children: slides,
                    },
                ],
            },
        ],
    };
}

function closeIcon(styling: ModuleStyling): string {
    return toDataUri(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${styling.mutedForeground}" d="M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z"/></svg>`
    );
}
