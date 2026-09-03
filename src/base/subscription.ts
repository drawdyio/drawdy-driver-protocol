import { DistributiveOmit, ProtocolCommand } from "./base";
import {
    SubscribeableKey,
    SubscribedDrawdyElement,
} from "./drawdy-element-schema";
import { ModuleStyling } from "./styling";

/**
 * The drawdy element properties to include in the subscription's events.
 */
type ElementSubscriptionRequest = {
    properties: SubscribeableKey[];
};

type CameraMovedEventBody = {
    x: number;
    y: number;
    zoom: number;
};

export type ControlKey =
    | "tab"
    | "enter"
    | "shift"
    | "escape"
    | "space"
    | "backspace"
    | "delete"
    | "arrow-up"
    | "arrow-down"
    | "arrow-left"
    | "arrow-right";

export type DriverSubscription =
    | ProtocolSubscription<
          "subscription:dom:element-clicked",
          {
              domElementId: string;
          }
      >
    | ProtocolSubscription<
          "subscription:dom:element-hovered",
          {
              domElementId: string;
          }
      >
    | ProtocolSubscription<
          "subscription:scene:elements-added",
          ElementSubscriptionRequest
      >
    | ProtocolSubscription<
          "subscription:scene:elements-removed",
          ElementSubscriptionRequest
      >
    | ProtocolSubscription<
          "subscription:scene:elements-replaced",
          ElementSubscriptionRequest
      >
    | ProtocolSubscription<
          "subscription:scene:elements-updated",
          ElementSubscriptionRequest
      >
    | ProtocolSubscription<"subscription:dom:theme-changed", undefined>
    | ProtocolSubscription<"subscription:dom:fullscreen-changed", undefined>
    | ProtocolSubscription<"subscription:dom:screen-resized", undefined>
    | ProtocolSubscription<
          "subscription:dom:drag",
          {
              domElementId: string;
          }
      >
    | ProtocolSubscription<
          "subscription:webview:message",
          {
              webviewDomId: string;
          }
      >
    | ProtocolSubscription<
          "subscription:scene:activity",
          {
              rect: {
                  width: number;
                  height: number;
                  x: number;
                  y: number;
              };
          }
      >
    | ProtocolSubscription<
          "subscription:context-menu:clicked",
          {
              menuId: string;
          }
      >
    | ProtocolSubscription<"subscription:camera:moved-rapid", undefined>
    | ProtocolSubscription<"subscription:camera:moved-debounced", undefined>
    | ProtocolSubscription<"subscription:scene:text-edit", undefined>
    | ProtocolSubscription<"subscription:keyboard:control-keys", undefined>
    | ProtocolSubscription<
          "subscription:scene:pointer",
          // subscribes to all if undefined
          { elementIds?: string[] }
      >;

export type DriverSubscriptionEvent =
    | ProtocolSubscriptionEvent<
          "subscription:scene:elements-added",
          {
              drawdyElements: readonly SubscribedDrawdyElement[];
              properties: SubscribeableKey[];
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:scene:elements-removed",
          {
              drawdyElements: readonly SubscribedDrawdyElement[];
              properties: SubscribeableKey[];
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:scene:elements-replaced",
          {
              /**
               * The elements that replaced everything.
               */
              drawdyElements: readonly SubscribedDrawdyElement[];
              /**
               * The elements that got replaced.
               */
              replaced: readonly SubscribedDrawdyElement[];
              properties: SubscribeableKey[];
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:scene:elements-updated",
          {
              drawdyElements: readonly SubscribedDrawdyElement[];
              properties: SubscribeableKey[];
          }
      >
    /**
     * When there are activity in the area, this subscription is triggered.
     */
    | ProtocolSubscriptionEvent<
          "subscription:scene:activity",
          {
              drawdyElementIds: string[];
              rect: {
                  width: number;
                  height: number;
                  x: number;
                  y: number;
              };
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:dom:element-clicked",
          {
              domElementId: string;
              clientX: number;
              clientY: number;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:dom:element-hovered",
          {
              domElementId: string;
              clientX: number;
              clientY: number;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:dom:theme-changed",
          {
              styling: ModuleStyling;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:dom:fullscreen-changed",
          {
              fullscreen: boolean;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:dom:screen-resized",
          {
              width: number;
              height: number;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:dom:drag",
          {
              type: "dragStart" | "dragging" | "dragEnd";
              domElementId: string;
              position: {
                  canvasSpace: { x: number; y: number };
                  domSpace: { x: number; y: number };
              };
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:webview:message",
          {
              webviewDomId: string;
              message: unknown;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:context-menu:clicked",
          {
              menuId: string;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:camera:moved-rapid",
          CameraMovedEventBody
      >
    | ProtocolSubscriptionEvent<
          "subscription:camera:moved-debounced",
          CameraMovedEventBody
      >
    | ProtocolSubscriptionEvent<
          "subscription:scene:text-edit",
          | {
                type: "update";
                rect: {
                    width: number;
                    height: number;
                    x: number;
                    y: number;
                };
                font: number;
                lineHeight: number;
                text: string;
            }
          | {
                type: "commit" | "cancel";
                rect?: never;
                font?: never;
                lineHeight?: never;
                text?: never;
            }
      >
    | ProtocolSubscriptionEvent<
          "subscription:keyboard:control-keys",
          {
              key: ControlKey;
              shift: boolean;
              ctrl: boolean;
              meta: boolean;
              alt: boolean;
          }
      >
    | ProtocolSubscriptionEvent<
          "subscription:scene:pointer",
          {
              type: "up" | "down";
              drawdyElementIds: string[];
              /**
               * https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure
               */
              pressure: number;
              cursor: {
                  domSpace: { x: number; y: number };
                  canvasSpace: { x: number; y: number };
              };
          }
      >;

// Yes, subscription is just a specialized command
type ProtocolSubscription<T, REQ> = ProtocolCommand<
    T,
    REQ,
    { subscriptionId: string }
>;

export type ProtocolSubscriptionEvent<T, BODY> = {
    type: T;
    subscriptionId: string;
} & ([BODY] extends [undefined] ? {} : { body: BODY });

export type SubscriptionCommand = DistributiveOmit<DriverSubscription, "res">;

// =================================================== type assertions below.

type ExtractTopic<T> =
    T extends ProtocolSubscription<infer Topic, unknown>
        ? Topic
        : T extends ProtocolSubscriptionEvent<infer Topic, unknown>
          ? Topic
          : never;

type SubTopics = ExtractTopic<DriverSubscription>;
type EventTopics = ExtractTopic<DriverSubscriptionEvent>;

// DO NOT REMOVE THIS. This type exist to assert that there exxist an event for each of the subscription above.
// there may be easier ways but let's refactor later.
type AssertAllSubscriptionsHaveEvents<T extends EventTopics = SubTopics> = true;
