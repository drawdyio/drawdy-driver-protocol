export interface ProtocolError<T extends string> {
    type: T;
    message?: string;
    body?: Record<string, any>;
}

/**
 * thrown for all drawdy runtime bugs that cause exceptions.
 */
export type DrawdyRuntimeError = ProtocolError<"runtime">;

export type ClientError = ProtocolError<"bad-argument" | "not-found">;
/**
 * When permission is not granted, this error is thrown.
 *
 * It is up to the developers to handle how to gracefully degrade the driver's functionalities.
 */
export type UnauthorizedError = ProtocolError<"unauthorized">;

export type DistributiveOmit<T, K extends string> = T extends any
    ? Omit<T, K>
    : never;
export type ProtocolCommandError =
    | DrawdyRuntimeError
    | ClientError
    | UnauthorizedError;

export type ProtocolCommand<T, REQ, RES> = {
    driverId: string;
    requestId: string;
    type: T;
    res:
        | { error?: never; value: RES }
        | {
              error: ProtocolCommandError;
              value?: never;
          };
} & ([REQ] extends [undefined] ? {} : { req: REQ });
