import { DriverModule, SubscribeableKey } from "@drawdy/driver-protocol";
import { Ctx, stamp, unwrap } from "./driver/context";
import {
    dynamicMenuId,
    refreshMenuChecks,
    resetMenuChecks,
    staticMenuId,
    toggleSelectionTag,
} from "./driver/menu";
import { physicsMode } from "./driver/meta";
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
];

// Board content and driver activation race differently per entry route
// (reload vs. in-app navigation), so auto-start retries several moments.
const AUTO_START_RETRIES_MS = [800, 2000, 4000, 8000, 15000];

/** Poll rate for the submenu's ✓ state. */
const MENU_POLL_MS = 500;

let driver: {
    ctx: Ctx;
    session: PhysicsSession;
} | null = null;

export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
    generateId,
}) => {
    let requestId = 0;
    const ctx: Ctx = {
        driverId: manifest.driverId,
        issueCommand,
        generateId,
        nextRequestId: () => String(requestId++),
    };
    const session = new PhysicsSession(ctx);
    driver = { ctx, session };
    console.info(`[drawdy-physics] activated (${manifest.driverVersion})`);

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

    // The viewport walls track the camera.
    unwrap(
        await issueCommand({
            type: "subscription:camera:moved-rapid",
            ...stamp(ctx),
        })
    );

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

    // Submenu ✓ tracking; metas re-fetched only when the selection changed
    // or a tag flipped.
    let lastSelectionKey: string | null = null;
    let tagsDirty = false;
    session.onTagsChanged = () => {
        tagsDirty = true;
    };
    setInterval(async () => {
        const d = driver;
        if (!d) return;
        try {
            const { drawdyElementIds } = unwrap(
                await issueCommand({
                    type: "command:scene:get-current-selected-drawdy-elements",
                    ...stamp(ctx),
                })
            );
            const key = [...drawdyElementIds].sort().join(",");
            if (key === lastSelectionKey && !tagsDirty) return;
            lastSelectionKey = key;
            tagsDirty = false;
            if (drawdyElementIds.length === 0) {
                await refreshMenuChecks(ctx, { static: false, dynamic: false });
                return;
            }
            const selected = new Set(drawdyElementIds);
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
            // board may be mid-teardown; retry next poll
        }
    }, MENU_POLL_MS);
};

export const onEvent: DriverModule["onEvent"] = async (e) => {
    if (!driver) return;
    const { ctx, session } = driver;
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
            session.onTagsChanged?.();
            if (changed > 0) await session.restart();
            return;
        }
        case "subscription:scene:elements-removed": {
            session.onElementsRemoved(e.body.drawdyElements.map((x) => x.id));
            return;
        }
        case "subscription:scene:elements-updated": {
            session.onElementsUpdated(e.body.drawdyElements);
            return;
        }
        case "subscription:camera:moved-rapid": {
            session.onCameraMoved();
            return;
        }
        case "subscription:scene:elements-added": {
            session.onElementsAppeared(e.body.drawdyElements);
            return;
        }
        case "subscription:scene:elements-replaced": {
            session.onElementsAppeared(e.body.drawdyElements);
            return;
        }
        default:
            return;
    }
};
