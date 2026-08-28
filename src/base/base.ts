export type DistributiveOmit<T, K extends string> = T extends any
    ? Omit<T, K>
    : never;

export type ProtocolCommand<T, REQ, RES> = {
    driverId: string;
    requestId: string;
    type: T;
    res: { error?: never; value: RES } | { error: string; value?: never };
} & ([REQ] extends [undefined] ? {} : { req: REQ });
