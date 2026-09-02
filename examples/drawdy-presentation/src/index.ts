import {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { WEBVIEW_HTML } from "virtual:webview-html";
import { handleAddToPresentation } from "./handle-add-to-presentation";
import { handleSlidePresetAdd } from "./handle-slide-preset-add";
import {
    handleSlidePresetOpen,
    pickerCloseButtonId,
    pickerDomId,
    presetButtonId,
} from "./handle-slide-preset-open";
import {
    deckLaserButtonId,
    deckNextButtonId,
    deckPrevButtonId,
    deckStopButtonId,
    PresentingController,
} from "./presenting";
import { slidePresets } from "./slide-presets";
import { SlidePreviewTracker } from "./slide-previews";

function addToPresentationMenuId(driverId: string): string {
    return `${driverId}:add-to-presentation`;
}

let requestId = 0;
let driver: {
    manifest: DriverManifest;
    issueCommand: DriverCommandIssuer;
    actionButtonId: string;
    webviewId: string;
    styling: ModuleStyling;
    generateId: () => string;
    previews: SlidePreviewTracker;
    presenting: PresentingController;
} | null = null;

/**
 * ModuleStyling as `--drawdy-*` css variable declarations for the webview's
 * `:root` placeholder, e.g. `primaryForeground` -> `--drawdy-primary-foreground`.
 */
function stylingCssVars(styling: ModuleStyling): string {
    const stringified = Object.entries(styling)
        .map(([key, value]) =>
            key === "theme"
                ? `color-scheme: ${value};`
                : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
        )
        .join("");
    return stringified;
}

// called once on driver activation
export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    styling,
    generateId,
}) => {
    console.info("[drawdy-presentation] styling on activate:", styling);

    const webviewId = `${manifest.driverId}:webview`;
    const previews = new SlidePreviewTracker({
        driverId: manifest.driverId,
        webviewId,
        issueCommand,
        nextRequestId: () => String(requestId++),
    });
    driver = {
        manifest,
        issueCommand,
        actionButtonId: `${manifest.driverId}:action-button`,
        webviewId,
        styling,
        generateId,
        previews,
        presenting: new PresentingController({
            driverId: manifest.driverId,
            issueCommand,
            nextRequestId: () => String(requestId++),
            getStyling: () => driver?.styling ?? styling,
            getOrderedFrameIds: () => previews.getOrderedFrameIds(),
        }),
    };

    const response = await driver.issueCommand({
        type: "command:dom:create-action-button",
        driverId: manifest.driverId,
        requestId: String(requestId++),
        req: {
            domElementId: driver.actionButtonId,
            svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="red" class="remixicon text-white/60"><path d="M13 17V20H18V22H6V20H11V17H4C3.44772 17 3 16.5523 3 16V4H2V2H22V4H21V16C21 16.5523 20.5523 17 20 17H13ZM5 15H19V4H5V15ZM10 6L15 9.5L10 13V6Z"></path></svg>`,
        },
    });

    if (!response.res.value?.created) {
        return;
    }

    await driver.issueCommand({
        type: "subscription:dom:theme-changed",
        driverId: manifest.driverId,
        requestId: String(requestId++),
    });

    // Ends the show when fullscreen dies, Esc included — same contract as
    // the real presenter.
    await driver.issueCommand({
        type: "subscription:dom:fullscreen-changed",
        driverId: manifest.driverId,
        requestId: String(requestId++),
    });

    await driver.issueCommand({
        type: "command:context-menu:add",
        driverId: manifest.driverId,
        requestId: String(requestId++),
        req: {
            menuId: addToPresentationMenuId(manifest.driverId),
            menuTitle: "Add to presentation",
        },
    });
    await driver.issueCommand({
        type: "subscription:context-menu:clicked",
        driverId: manifest.driverId,
        requestId: String(requestId++),
        req: {
            menuId: addToPresentationMenuId(manifest.driverId),
        },
    });

    await driver.issueCommand({
        type: "subscription:webview:message",
        driverId: manifest.driverId,
        requestId: String(requestId++),
        req: {
            webviewDomId: driver.webviewId,
        },
    });

    for (const type of [
        "subscription:scene:elements-added",
        "subscription:scene:elements-removed",
        "subscription:scene:elements-updated",
        "subscription:scene:elements-replaced",
    ] as const) {
        await driver.issueCommand({
            type,
            driverId: manifest.driverId,
            requestId: String(requestId++),
            req: {
                properties: ["type", "meta"],
            },
        });
    }

    // Pick up slides that already exist on the board. Subscribing first then
    // fetching may double-track a slide that lands in between; upsert makes
    // that harmless.
    const existing = await driver.issueCommand({
        type: "command:scene:get-drawdy-elements",
        driverId: manifest.driverId,
        requestId: String(requestId++),
        req: {
            properties: ["type", "meta"],
        },
    });
    if (existing.res.error === undefined) {
        if (driver.previews.upsert(existing.res.value.drawdyElements)) {
            driver.previews.refresh();
        }
    }

    const clickables = [
        driver.actionButtonId,
        pickerCloseButtonId(manifest.driverId),
        deckPrevButtonId(manifest.driverId),
        deckNextButtonId(manifest.driverId),
        deckLaserButtonId(manifest.driverId),
        deckStopButtonId(manifest.driverId),
        ...slidePresets(styling).map((preset) =>
            presetButtonId(manifest.driverId, preset.id)
        ),
    ];
    for (const domElementId of clickables) {
        await driver.issueCommand({
            type: "subscription:dom:element-clicked",
            driverId: manifest.driverId,
            requestId: String(requestId++),
            req: {
                domElementId,
            },
        });
    }
};

export const onEvent: DriverModule["onEvent"] = async (e) => {
    if (!driver) return;
    switch (e.type) {
        case "subscription:dom:theme-changed": {
            driver.styling = e.body.styling;
            console.info(
                "[drawdy-presentation] theme changed:",
                e.body.styling
            );
            return;
        }
        case "subscription:webview:message": {
            if (e.body.webviewDomId !== driver.webviewId) return;
            if (typeof e.body.message !== "object") return;

            const body = e.body.message as Record<string, any>;
            switch (body.type) {
                case "ready": {
                    // The webview document just connected; push the current
                    // deck and previews.
                    driver.previews.refresh();
                    return;
                }
                case "present-clicked": {
                    if (driver.previews.getOrderedFrameIds().length === 0) {
                        return;
                    }
                    await driver.issueCommand({
                        type: "command:webview:hide",
                        driverId: driver.manifest.driverId,
                        requestId: String(requestId++),
                        req: {
                            webviewDomId: driver.webviewId,
                        },
                    });
                    // Let the drawer's 300ms exit animation finish before
                    // fullscreen + camera fly kick in.
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    await driver.presenting.begin();
                    return;
                }
                case "slide-clicked": {
                    const { frameId } = body as { frameId: string };
                    if (typeof frameId !== "string") return;
                    await driver.issueCommand({
                        type: "command:camera:fly-to-elements",
                        driverId: driver.manifest.driverId,
                        requestId: String(requestId++),
                        req: {
                            drawdyElementIds: [frameId],
                            flyDurationMs: 500,
                            // fly-to fits the rect; this is the max zoom.
                            zoom: 1,
                        },
                    });
                    return;
                }
                case "reorder": {
                    const { orderedFrameIds } = body as {
                        orderedFrameIds: string[];
                    };
                    if (
                        !Array.isArray(orderedFrameIds) ||
                        orderedFrameIds.some((id) => typeof id !== "string")
                    ) {
                        return;
                    }
                    // Renumber the deck; the scene echoes an elements-updated
                    // event that re-syncs the tracker and the webview.
                    await driver.issueCommand({
                        type: "command:scene:update-drawdy-elements",
                        driverId: driver.manifest.driverId,
                        requestId: String(requestId++),
                        req: {
                            updates: orderedFrameIds.map((frameId, i) => ({
                                drawdyElementId: frameId,
                                properties: {
                                    meta: { extensionSlideOrder: i + 1 },
                                },
                            })),
                        },
                    });
                    return;
                }
                case "plus-clicked": {
                    const { x, y } = body as { x: number; y: number };
                    if (typeof x !== "number" || typeof y !== "number") {
                        console.error(
                            `invalid body type: ${typeof body === "object" ? JSON.stringify(body) : String(body)}`
                        );
                        return;
                    }
                    void handleSlidePresetOpen({
                        webviewCursorPosition: {
                            x,
                            y,
                        },
                        driverId: driver.manifest.driverId,
                        issueCommand: driver.issueCommand,
                        requestId: {
                            getAndBump() {
                                return requestId++;
                            },
                        },
                        webviewId: driver.webviewId,
                        styling: driver.styling,
                    });
                    return;
                }
                default: {
                    console.info(
                        "[drawdy-presentation] unknown message:",
                        e.body.message
                    );
                    return;
                }
            }
        }
        case "subscription:dom:fullscreen-changed": {
            await driver.presenting.onFullscreenChanged(e.body.fullscreen);
            return;
        }
        case "subscription:context-menu:clicked": {
            if (
                e.body.menuId !==
                addToPresentationMenuId(driver.manifest.driverId)
            ) {
                return;
            }
            await handleAddToPresentation({
                slideOrder: driver.previews.getNextOrder(),
                driverId: driver.manifest.driverId,
                issueCommand: driver.issueCommand,
                generateId: driver.generateId,
                requestId: {
                    getAndBump() {
                        return requestId++;
                    },
                },
            });
            return;
        }
        case "subscription:dom:element-clicked": {
            const clickedId = e.body.domElementId;

            if (clickedId === deckPrevButtonId(driver.manifest.driverId)) {
                await driver.presenting.back();
                return;
            }

            if (clickedId === deckNextButtonId(driver.manifest.driverId)) {
                await driver.presenting.forward();
                return;
            }

            if (clickedId === deckLaserButtonId(driver.manifest.driverId)) {
                await driver.presenting.toggleLaser();
                return;
            }

            if (clickedId === deckStopButtonId(driver.manifest.driverId)) {
                await driver.presenting.end();
                return;
            }

            if (clickedId === driver.actionButtonId) {
                await driver.issueCommand({
                    type: "command:webview:create",
                    driverId: driver.manifest.driverId,
                    requestId: String(requestId++),
                    req: {
                        webviewDomId: driver.webviewId,
                        htmlContent: WEBVIEW_HTML.replace(
                            "/*__DRAWDY_STYLING__*/",
                            stylingCssVars(driver.styling)
                        ),
                        keepStateWhenClosed: true,
                    },
                });
                return;
            }

            if (clickedId === pickerCloseButtonId(driver.manifest.driverId)) {
                await driver.issueCommand({
                    type: "command:dom:remove-floating-element",
                    driverId: driver.manifest.driverId,
                    requestId: String(requestId++),
                    req: {
                        domId: pickerDomId(driver.manifest.driverId),
                    },
                });
                return;
            }

            const presetPrefix = presetButtonId(driver.manifest.driverId, "");
            if (clickedId.startsWith(presetPrefix)) {
                await handleSlidePresetAdd({
                    presetId: clickedId.slice(presetPrefix.length),
                    slideOrder: driver.previews.getNextOrder(),
                    driverId: driver.manifest.driverId,
                    issueCommand: driver.issueCommand,
                    generateId: driver.generateId,
                    requestId: {
                        getAndBump() {
                            return requestId++;
                        },
                    },
                });
                return;
            }
            return;
        }
        case "subscription:scene:elements-added": {
            if (driver.previews.upsert(e.body.drawdyElements)) {
                driver.previews.refresh();
            }
            return;
        }
        case "subscription:scene:elements-removed": {
            if (
                driver.previews.removeByIds(
                    e.body.drawdyElements.map((x) => x.id)
                )
            ) {
                driver.previews.refresh();
            }
            return;
        }
        case "subscription:scene:elements-updated": {
            const touchedTracked = e.body.drawdyElements.some((x) =>
                driver!.previews.has(x.id)
            );
            const changed = driver.previews.upsert(e.body.drawdyElements);
            if (changed || touchedTracked) {
                driver.previews.refresh();
            }
            return;
        }
        case "subscription:scene:elements-replaced": {
            driver.previews.rebuild(e.body.drawdyElements);
            driver.previews.refresh();
            return;
        }
        case "subscription:scene:activity": {
            driver.previews.refreshBySubscription(e.subscriptionId);
            return;
        }
        default: {
            // Events for subscriptions this driver never made.
            return;
        }
    }
};
