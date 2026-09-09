import { ProtocolPermission } from "./base";

/**
    Host confirms manifest correctness with driver. If the manifest is not correct, invalid
 */
export interface DriverManifest {
    driverId: string;
    driverName: string;
    driverVersion: string;
    description?: string;

    /** Entry bundle filename inside the .drawdyx zip. */
    main: string;
    /**
     * Declared permissions. Drawdy will reject commands that depend on permissions not declared in this list.
     */
    permissions: ProtocolPermission[];
}
