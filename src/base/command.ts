import { DistributiveOmit, ProtocolCommand } from "./base";
import { ContextMenu } from "./context-menu";
import { DriverElement } from "./driver-element";
import {
    ElementSchema,
    SubscribeableKey,
    SubscribedDrawdyElement,
    UpdateableProperties,
} from "./element-schema";
import { ScenePreviewCommand } from "./preview";
import { DriverSubscription } from "./subscription";
import { StyleableToolId, ToolStyleState } from "./tool-state";

/**
 * Commands set sent from driver to drawdy.
 */
export type DriverCommand =
    | ProtocolCommand<
          "command:camera:get-info",
          undefined,
          {
              x: number;
              y: number;
              zoom: number;
          }
      >
    | ProtocolCommand<
          "command:camera:fly-to-elements",
          {
              drawdyElementIds: string[];
              flyDurationMs: number;
              zoom: number;
          },
          undefined
      >
    | ProtocolCommand<
          "command:camera:fly-to-rect",
          {
              rect: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
              };
              flyDurationMs: number;
              /**
               * The max zoom; fly-to fits the rect.
               */
              zoom: number;
          },
          undefined
      >
    | ProtocolCommand<
          "command:camera:screen-to-canvas",
          { x: number; y: number },
          { x: number; y: number }
      >
    | ProtocolCommand<
          "command:camera:canvas-to-screen",
          { x: number; y: number },
          { x: number; y: number }
      >
    | ProtocolCommand<
          "command:camera:get-viewport-rect",
          undefined,
          {
              /**
               * The visible canvas area in canvas coordinates.
               */
              rect: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
              };
          }
      >
    | ProtocolCommand<
          "command:dom:create-action-button",
          {
              domElementId: string;
              /**
               * For now only svg, might support png too in the future.
               */
              svg: string;
          },
          { created: boolean }
      >
    | ProtocolCommand<
          "command:webview:create",
          {
              webviewDomId: string;
              htmlContent: string;
              /**
               * When true, closing the webview hides it. The webview stays active and dies with the tab.
               * However this consumes resources. If possible, make your webview stateless.
               */
              keepStateWhenClosed?: boolean;
          },
          { created: boolean }
      >
    | ProtocolCommand<
          "command:webview:hide",
          {
              webviewDomId: string;
          },
          undefined
      >
    | ProtocolCommand<
          "command:dom:window-size",
          undefined,
          { width: number; height: number }
      >
    | ProtocolCommand<
          "command:dom:enter-fullscreen",
          undefined,
          {
              /**
               * false when the browser refused or doesn't support it.
               */
              entered: boolean;
          }
      >
    | ProtocolCommand<
          "command:dom:exit-fullscreen",
          undefined,
          {
              /**
               * false when the document wasn't fullscreen.
               */
              exited: boolean;
          }
      >
    | ProtocolCommand<
          "command:dom:element-rect",
          { elementId: string },
          { width: number; height: number; x: number; y: number }
      >
    | ProtocolCommand<
          "command:dom:create-floating-element",
          {
              domId: string;
              /**
               * The fixed position in the dom.
               */
              position: { x: number; y: number };
              schema: ElementSchema;
              /**
               * When true, clicking outside the element dismisses it — same
               * effect as command:dom:remove-element. The driver is NOT
               * notified; poll command:dom:element-rect if you need to know.
               * Defaults to false.
               */
              barrierDismissible?: boolean;
          },
          { created: boolean }
      >
    | ProtocolCommand<
          "command:dom:remove-element",
          {
              domId: string;
          },
          { removed: boolean }
      >
    | ProtocolCommand<
          "command:scene:add-drawdy-elements",
          {
              elements: DriverElement[];
          },
          { added: boolean }
      >
    | ProtocolCommand<
          "command:scene:create-drawdy-preview-elements",
          {
              elements: DriverElement[];
          },
          { previewed: number; previewId: string }
      >
    | ProtocolCommand<
          "command:scene:delete-drawdy-preview-elements",
          {
              previewIds: string[];
          },
          { deleted: number }
      >
    | ProtocolCommand<
          "command:scene:remove-drawdy-elements",
          {
              drawdyElementIds: string[];
          },
          {
              removed: number;
          }
      >
    | ProtocolCommand<
          "command:scene:query-rect",
          {
              rect: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
              };
              properties: SubscribeableKey[];
          },
          {
              drawdyElements: SubscribedDrawdyElement[];
          }
      >
    | ProtocolCommand<
          "command:scene:set-selection",
          {
              drawdyElementIds: string[];
          },
          undefined
      >
    | ProtocolCommand<"command:scene:clear-selection", undefined, undefined>
    | ProtocolCommand<
          "command:scene:capture-screenshot",
          {
              area: {
                  width: number;
                  height: number;
                  x: number;
                  y: number;
              };
          },
          { png: Blob }
      >
    | ProtocolCommand<
          "command:scene:get-drawdy-elements",
          {
              properties: SubscribeableKey[];
          },
          {
              drawdyElements: SubscribedDrawdyElement[];
          }
      >
    | ProtocolCommand<
          "command:scene:update-drawdy-elements",
          {
              updates: {
                  drawdyElementId: string;
                  /**
                   * `meta` is merged into the element's existing meta; other
                   * properties are set as given.
                   */
                  properties: UpdateableProperties;
              }[];
          },
          {
              updated: number;
          }
      >
    | ProtocolCommand<
          "command:scene:get-selected-ids",
          undefined,
          {
              drawdyElementIds: string[];
          }
      >
    | ProtocolCommand<
          "command:scene:query-combined-rect",
          {
              drawdyElementIds: string[];
          },
          {
              /**
               * The union of the elements' bounding rects; null when none of
               * the ids exist.
               */
              rect: {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
              } | null;
          }
      >
    | ProtocolCommand<
          "command:scene:element-rects",
          {
              drawdyElementIds: string[];
          },
          {
              rects: {
                  drawdyElementId: string;
                  rect: {
                      x: number;
                      y: number;
                      width: number;
                      height: number;
                  };
              }[];
          }
      >
    | ProtocolCommand<
          "command:webview:post-message",
          {
              webviewDomId: string;
              message: unknown;
          },
          {
              /**
               * false when the webview doesn't exist or isn't connected yet.
               */
              posted: boolean;
          }
      >
    | ProtocolCommand<
          "command:tools:get-active",
          undefined,
          {
              toolId: string | null;
          }
      >
    | ProtocolCommand<
          "command:tools:set-active",
          {
              toolId: string;
          },
          undefined
      >
    | ProtocolCommand<
          "command:tools:update-settings",
          {
              settings: {
                  strokeColor?: string;
                  strokeWidth?: number;
                  opacity?: number;
                  strokeTexture?: Record<string, unknown> | null;
              };
          },
          undefined
      >
    | ProtocolCommand<
          "command:scene:query-tool-state",
          { toolId: StyleableToolId },
          { state: ToolStyleState | null }
      >
    | ProtocolCommand<
          "command:tools:emulate-pointer",
          {
              actions: Array<
                  | { kind: "down"; point: [number, number]; pressure?: number }
                  | { kind: "move"; point: [number, number]; pressure?: number }
                  | { kind: "up"; point: [number, number] }
                  | { kind: "cancel" }
              >;
          },
          undefined
      >
    | ProtocolCommand<
          "command:context-menu:add",
          ContextMenu,
          { added: boolean }
      >
    | ProtocolCommand<
          "command:context-menu:remove",
          {
              menuId: string;
          },
          { removed: boolean }
      >
    | ProtocolCommand<
          "command:kv-storage:set",
          {
              key: string;
              payload: Record<string, unknown>;
          },
          undefined
      >
    | ProtocolCommand<
          "command:kv-storage:get",
          { key: string },
          {
              got?: Record<string, unknown>;
          }
      >
    | ProtocolCommand<
          "command:kv-storage:delete",
          { key: string },
          {
              deleted: boolean;
          }
      >
    | ProtocolCommand<
          "command:secure-storage:set",
          {
              key: string;
              payload: Record<string, unknown>;
          },
          undefined
      >
    | ProtocolCommand<
          "command:secure-storage:get",
          { key: string },
          {
              got?: Record<string, unknown>;
          }
      >
    | ProtocolCommand<
          "command:secure-storage:delete",
          { key: string },
          {
              deleted: boolean;
          }
      >
    | ProtocolCommand<"command:history:undo", undefined, undefined>
    | ProtocolCommand<"command:history:redo", undefined, undefined>
    | ProtocolCommand<
          "command:scene:cancel-text-edit",
          undefined,
          { cancelled: boolean }
      >
    /**
     * Replaces the text of the active text edit in place, keeping the editor
     * open so the user can continue typing. `updated` is false when no text
     * edit is in progress.
     */
    | ProtocolCommand<
          "command:scene:update-text-edit",
          { text: string },
          { updated: boolean }
      >
    | ProtocolCommand<
          "command:subscription:remove",
          {
              subscriptionId: string;
          },
          { removed: boolean }
      >
    | ScenePreviewCommand
    | DriverSubscription;

export type DriverCommandRequest = DistributiveOmit<DriverCommand, "res">;

export type DriverCommandResponse = DistributiveOmit<DriverCommand, "req">;

export type DriverCommandResponseFor<R extends DriverCommandRequest> =
    DistributiveOmit<Extract<DriverCommand, { type: R["type"] }>, "req">;
