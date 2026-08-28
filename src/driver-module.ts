import {
    DriverCommandRequest,
    DriverCommandResponseFor,
    DriverSubscriptionEvent,
    ModuleStyling,
} from "./base";
import { DriverManifest } from "./driver-manifest";

export type DriverCommandIssuer = <R extends DriverCommandRequest>(
    r: R
) => Promise<DriverCommandResponseFor<R>>;

export type DriverModule = {
    activate(args: {
        issueCommand: DriverCommandIssuer;

        /**
         * Manifest registered
         */
        manifest: DriverManifest;

        styling: ModuleStyling;

        /**
         * Use this to generate Drawdy elements (the elements on the canvas).
         */
        generateId: () => string;
    }): Promise<void>;

    onEvent(e: DriverSubscriptionEvent): Promise<void>;
};
