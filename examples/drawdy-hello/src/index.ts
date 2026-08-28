import {
    DriverCommandIssuer,
    DriverManifest,
    DriverModule,
} from "@drawdy/driver-protocol";

let requestId = 0;
let driver: {
    manifest: DriverManifest;
    issueCommand: DriverCommandIssuer;
} | null = null;

// called once on driver activation
export const activate: DriverModule["activate"] = async ({
    manifest,
    issueCommand,
}) => {
    driver = {
        manifest,
        issueCommand,
    };

    // A subscription is just a command; matching events arrive at onEvent.
    await issueCommand({
        type: "subscription:scene:elements-added",
        driverId: manifest.driverId,
        requestId: String(requestId++),
        req: {
            properties: [],
        },
    });
};

export const onEvent: DriverModule["onEvent"] = async (e) => {
    if (!driver) return;
    switch (e.type) {
        case "subscription:scene:elements-added": {
            const { res } = await driver.issueCommand({
                type: "command:camera:get-info",
                driverId: driver.manifest.driverId,
                requestId: String(requestId++),
            });
            if (res.error !== undefined) {
                return;
            }

            await driver.issueCommand({
                type: "command:camera:fly-to-elements",
                driverId: driver.manifest.driverId,
                requestId: String(requestId++),
                req: {
                    drawdyElementIds: e.body.drawdyElements.map((x) => x.id),
                    flyDurationMs: 300,
                    // keep current zoom
                    zoom: res.value.zoom,
                },
            });
            return;
        }
        default: {
            // Events for subscriptions this driver never made.
            return;
        }
    }
};
