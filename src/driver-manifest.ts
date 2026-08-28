/**
Host confirms manifest correctness with driver. If the manifest is not correct, invalid
id, missing capabilities, or wrong apiVersion, host can decide how best to proceed forward.
 */
export interface DriverManifest {
    driverId: string;
    driverName: string;
    driverVersion: string;
    apiVersion: string;
    description?: string;

    /** Entry bundle filename inside the .drawdyx zip. */
    main: string;
}
