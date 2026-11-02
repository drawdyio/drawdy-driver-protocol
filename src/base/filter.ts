import { ProtocolCommand } from "./base";

export type FilterCommand =
    | ProtocolCommand<
          "command:filter:scene",
          { fragmentShader: string },
          undefined
      >
    | ProtocolCommand<"command:filter:clear", undefined, { cleared: boolean }>
    | ProtocolCommand<
          "command:filter:is-supported",
          undefined,
          { supported: boolean }
      >;
