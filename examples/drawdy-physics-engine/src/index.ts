import {
    DriverModule,
    ModuleStyling,
    SubscribeableKey,
} from "@drawdy/driver-protocol";
import { Ctx, stamp, unwrap } from "./driver/context";
import {
    dynamicMenuId,
    refreshMenuChecks,
    resetMenuChecks,
    staticMenuId,
    toggleSelectionTag,
} from "./driver/menu";
import { physicsMode } from "./driver/meta";
import {
    ACTION_BUTTON_SVG,
    WebviewToDriver,
    actionButtonId,
    handlePanelMessage,
    openPanel,
    panelWebviewId,
    postPanelState,
    postToPanel,
    stylingCssVars,
} from "./driver/panel";
import { syncSandboxLabels } from "./driver/sandbox";
import { PhysicsSession } from "./driver/session";

/** Properties the session needs to rebuild bodies. */
const UPDATE_PROPERTIES: SubscribeableKey[] = [
    "type",
    "componentType",
    "meta",
    "locked",
    "points",
    "rotation",
    "x",
    "y",
    "width",
    "height",
    "text",
];

// Board content and driver activation race differently per entry route
// (reload vs. in-app navigation), so auto-start retries several moments.
const AUTO_START_RETRIES_MS = [800, 2000, 4000, 8000, 15000];

/** Scene-event bursts (drags, commits) collapse into one panel refresh. */
const PANEL_STATE_DEBOUNCE_MS = 300;

let driver: {
    ctx: Ctx;
    session: PhysicsSession;
    styling: ModuleStyling;
    panelOpened: boolean;
    panelStateTimer: ReturnType<typeof setTimeout> | null;
    refreshChecks: () => Promise<void>;
    setSelection: (ids: string[]) => void;
} | null = null;

/** Refresh the panel's lists, debounced; a no-op until it was first opened. */
function schedulePanelState(): void {
    const d = driver;
    if (!d || !d.panelOpened) return;
    if (d.panelStateTimer) clearTimeout(d.panelStateTimer);
    d.panelStateTimer = setTimeout(() => {
        d.panelStateTimer = null;
        void postPanelState(d.ctx).catch(() => {});
    }, PANEL_STATE_DEBOUNCE_MS);
}

export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    generateId,
    styling,
}) => {
    let requestId = 0;
    const ctx: Ctx = {
        driverId: manifest.driverId,
        issueCommand,
        generateId,
        nextRequestId: () => String(requestId++),
    };
    const session = new PhysicsSession(ctx);

    let selectedIds: string[] = [];
    const refreshChecks = async (): Promise<void> => {
        try {
            if (selectedIds.length === 0) {
                await refreshMenuChecks(ctx, { static: false, dynamic: false });
                return;
            }
            const selected = new Set(selectedIds);
            const { drawdyElements } = unwrap(
                await issueCommand({
                    type: "command:scene:get-drawdy-elements",
                    ...stamp(ctx),
                    req: { properties: ["meta"] },
                })
            );
            const sel = drawdyElements.filter((el) => selected.has(el.id));
            await refreshMenuChecks(ctx, {
                static:
                    sel.length > 0 &&
                    sel.every((el) => physicsMode(el) === "static"),
                dynamic:
                    sel.length > 0 &&
                    sel.every((el) => physicsMode(el) === "dynamic"),
            });
        } catch {
            // board may be mid-teardown; the next selection change retries
        }
    };

    driver = {
        ctx,
        session,
        styling,
        panelOpened: false,
        panelStateTimer: null,
        refreshChecks,
        setSelection: (ids) => {
            selectedIds = ids;
        },
    };
    console.info(`[drawdy-physics] activated (${manifest.driverVersion})`);

    // Extension-rail panel: sandbox size + tagged-element lists.
    unwrap(
        await issueCommand({
            type: "command:dom:create-action-button",
            ...stamp(ctx),
            req: {
                domElementId: actionButtonId(ctx.driverId),
                svg: ACTION_BUTTON_SVG,
            },
        })
    );
    unwrap(
        await issueCommand({
            type: "subscription:dom:element-clicked",
            ...stamp(ctx),
            req: { domElementId: actionButtonId(ctx.driverId) },
        })
    );
    unwrap(
        await issueCommand({
            type: "subscription:webview:message",
            ...stamp(ctx),
            req: { webviewDomId: panelWebviewId(ctx.driverId) },
        })
    );
    unwrap(
        await issueCommand({
            type: "subscription:dom:theme-changed",
            ...stamp(ctx),
        })
    );

    // Extension → Physics → Static / Dynamic.
    // Tagging (re)starts the simulation — there is no run button.
    resetMenuChecks();
    await refreshMenuChecks(ctx, { static: false, dynamic: false });
    for (const menuId of [
        staticMenuId(ctx.driverId),
        dynamicMenuId(ctx.driverId),
    ]) {
        unwrap(
            await issueCommand({
                type: "subscription:context-menu:clicked",
                ...stamp(ctx),
                req: { menuId },
            })
        );
    }

    // Deletions drop bodies mid-run; geometry edits rebuild them in place.
    unwrap(
        await issueCommand({
            type: "subscription:scene:elements-removed",
            ...stamp(ctx),
            req: { properties: [] },
        })
    );
    unwrap(
        await issueCommand({
            type: "subscription:scene:elements-updated",
            ...stamp(ctx),
            req: { properties: UPDATE_PROPERTIES },
        })
    );

    for (const type of [
        "subscription:scene:drawdy-element-selection",
        "subscription:scene:drawdy-elements-dragged",
    ] as const) {
        unwrap(await issueCommand({ type, ...stamp(ctx) }));
    }

    // Auto-start when tagged content appears (paste, board load, peers).
    for (const type of [
        "subscription:scene:elements-added",
        "subscription:scene:elements-replaced",
    ] as const) {
        unwrap(
            await issueCommand({
                type,
                ...stamp(ctx),
                req: { properties: UPDATE_PROPERTIES },
            })
        );
    }
    for (const delay of AUTO_START_RETRIES_MS) {
        setTimeout(() => {
            const d = driver;
            if (!d || d.session.hasEverRun || d.session.running) return;
            console.info(`[drawdy-physics] auto-start attempt at ${delay}ms`);
            void d.session.restart();
        }, delay);
    }
};

export const onEvent: DriverModule["onEvent"] = async (e) => {
    if (!driver) return;
    const { ctx, session, refreshChecks, setSelection } = driver;
    switch (e.type) {
        case "subscription:context-menu:clicked": {
            const mode =
                e.body.menuId === staticMenuId(ctx.driverId)
                    ? ("static" as const)
                    : e.body.menuId === dynamicMenuId(ctx.driverId)
                      ? ("dynamic" as const)
                      : null;
            if (!mode) return;
            const changed = await toggleSelectionTag(ctx, mode);
            void refreshChecks();
            schedulePanelState();
            if (changed > 0) await session.restart();
            return;
        }
        case "subscription:scene:drawdy-element-selection": {
            setSelection(e.body.drawdyElementIds);
            void refreshChecks();
            return;
        }
        case "subscription:scene:drawdy-elements-dragged": {
            if (e.body.type === "dragEnd") session.onDragEnd();
            else session.onDragActive(e.body.drawdyElementIds);
            return;
        }
        case "subscription:scene:elements-removed": {
            session.onElementsRemoved(e.body.drawdyElements.map((x) => x.id));
            schedulePanelState();
            return;
        }
        case "subscription:scene:elements-updated": {
            session.onElementsUpdated(e.body.drawdyElements);
            void syncSandboxLabels(ctx, e.body.drawdyElements)
                .then((recreated) => (recreated ? session.restart() : null))
                .catch(() => {});
            schedulePanelState();
            return;
        }
        case "subscription:scene:elements-added": {
            session.onElementsAppeared(e.body.drawdyElements);
            schedulePanelState();
            return;
        }
        case "subscription:scene:elements-replaced": {
            session.onElementsAppeared(e.body.drawdyElements);
            schedulePanelState();
            return;
        }
        case "subscription:dom:element-clicked": {
            if (e.body.domElementId !== actionButtonId(ctx.driverId)) return;
            driver.panelOpened = true;
            await openPanel(ctx, driver.styling);
            // A kept-alive panel's baked-in vars may predate a theme flip.
            postToPanel(ctx, {
                type: "theme",
                css: stylingCssVars(driver.styling),
            });
            schedulePanelState();
            return;
        }
        case "subscription:webview:message": {
            if (e.body.webviewDomId !== panelWebviewId(ctx.driverId)) return;
            const message = e.body.message;
            if (typeof message !== "object" || message === null) return;
            await handlePanelMessage(ctx, session, message as WebviewToDriver);
            return;
        }
        case "subscription:dom:theme-changed": {
            const d = driver;
            if (!d) return;
            d.styling = e.body.styling;
            postToPanel(ctx, { type: "theme", css: stylingCssVars(d.styling) });
            return;
        }
        default:
            return;
    }
};
