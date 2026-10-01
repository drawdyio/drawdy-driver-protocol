import { ProtocolCommand } from "./base";

export type CollaborationUserInfo = {
    id: string;
    name: string;
    color: string;
    image?: string;
    isHost: boolean;
    isSelf: boolean;
};

export type CollaborationUserPresence = CollaborationUserInfo & {
    cursorPosition: { x: number; y: number } | null;
};

export type CollaborationCommand = ProtocolCommand<
    "command:collaboration:get-all-users-in-board",
    undefined,
    {
        users: CollaborationUserPresence[];
    }
>;
