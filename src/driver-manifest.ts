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
}
