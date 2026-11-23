import { ProtocolCommand } from "./base";

export type AuthCommand =
    | ProtocolCommand<
          "command:auth:check-logged-in",
          undefined,
          {
              loggedIn: boolean;
          }
      >
    | ProtocolCommand<
          "command:auth:check-can-edit",
          undefined,
          {
              canEdit: boolean;
          }
      >;
