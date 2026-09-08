import type {
    DriverCommandIssuer,
    DriverModule,
} from "@drawdy/driver-protocol";

const MENU_ID = "starter:add-note";

let issue: DriverCommandIssuer;
let generateId: () => string;
let driverId: string;
let requestSeq = 0;
let placed = 0;

const nextRequestId = () => String(requestSeq++);

export const activate: DriverModule["activate"] = async (ctx) => {
    issue = ctx.issueCommand;
    generateId = ctx.generateId;
    driverId = ctx.manifest.driverId;

    await issue({
        type: "command:context-menu:add",
        driverId,
        requestId: nextRequestId(),
        req: { menuId: MENU_ID, menuTitle: "Add sticky note" },
    });

    await issue({
        type: "subscription:context-menu:clicked",
        driverId,
        requestId: nextRequestId(),
        req: { menuId: MENU_ID },
    });
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (
        event.type !== "subscription:context-menu:clicked" ||
        event.body.menuId !== MENU_ID
    ) {
        return;
    }

    const offset = placed++ * 28;
    const noteId = generateId();
    await issue({
        type: "command:scene:add-drawdy-elements",
        driverId,
        requestId: nextRequestId(),
        req: {
            elements: [
                {
                    type: "text",
                    drawdyElementId: noteId,
                    x: 160 + offset,
                    y: 160 + offset,
                    text: "Hello from my extension",
                    fontSize: 24,
                    color: "#f59e0b",
                },
            ],
        },
    });

    await issue({
        type: "command:camera:fly-to-elements",
        driverId,
        requestId: nextRequestId(),
        req: {
            drawdyElementIds: [noteId],
            flyDurationMs: 400,
            zoom: 1,
        },
    });
};
