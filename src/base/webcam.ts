import { ProtocolCommand } from "./base";

export type WebcamFrameInit = {
    format: VideoPixelFormat;
    codedWidth: number;
    codedHeight: number;
    timestamp: number;
    layout: PlaneLayout[];
    visibleRect?: DOMRectInit;
    colorSpace: VideoColorSpaceInit;
};

export type WebcamFrameMessage = {
    type: "frame";
    frameData: Uint8Array;
    init: WebcamFrameInit;
    metadata: VideoFrameCallbackMetadata;
};

export type WebcamCancelMessage = {
    type: "cancel";
};

export type WebcamPortMessage = WebcamFrameMessage | WebcamCancelMessage;

export type WebcamFramePort = Omit<
    MessagePort,
    "onmessage" | "addEventListener"
> & {
    onmessage:
        | ((this: MessagePort, ev: MessageEvent<WebcamPortMessage>) => void)
        | null;
    addEventListener(
        type: "message",
        listener: (
            this: MessagePort,
            ev: MessageEvent<WebcamPortMessage>
        ) => void,
        options?: boolean | AddEventListenerOptions
    ): void;
};

export type WebcamNotAvailableReason = "no-camera" | "in-use";

export type WebcamCommand =
    | ProtocolCommand<
          "command:webcam:start-stream",
          {
              constraints?: MediaTrackConstraints;
          },
          | {
                port?: never;
                notAvailableReason: WebcamNotAvailableReason;
            }
          | {
                notAvailableReason?: never;
                port: WebcamFramePort;
            }
      >
    | ProtocolCommand<"command:webcam:end-stream", undefined, undefined>;
