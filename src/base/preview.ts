import { ProtocolCommand } from "./base";

/**
 * A pose delta from the element's REST pose (its geometry as captured at
 * begin-preview): `x`/`y` are a world-space translation and `rotation`
 * (radians) is applied on top of the element's rest rotation about its
 * bounding-box center. `scale` is reserved and currently ignored.
 */
export type PreviewTransform = {
    x: number;
    y: number;
    scale: number;
    rotation: number;
};

/**
 * Preview lifecycle: `begin-preview` snapshots each element's rest geometry
 * and moves it onto the animation layer; `preview-transforms` bakes per-tick
 * deltas from that rest pose into the element's real LOCAL geometry silently
 * (nothing syncs, enters undo, or echoes as a scene event — but hit-testing
 * and selection follow); `end-preview` restores non-committed elements,
 * optionally baking final deltas as one undo step and one collaboration sync.
 */
export type ScenePreviewCommand =
    | ProtocolCommand<
          "command:scene:begin-preview",
          {
              drawdyElementIds: string[];
              holdOnDrag?: boolean;
          },
          {
              /**
               * The ids that entered preview. Grouped elements are rejected
               * (their rotation pivot is the group center).
               */
              began: string[];
          }
      >
    | ProtocolCommand<
          "command:scene:preview-transforms",
          {
              previews: {
                  drawdyElementId: string;
                  transform: PreviewTransform;
              }[];
          },
          undefined
      >
    | ProtocolCommand<
          "command:scene:end-preview",
          {
              /**
               * Bake these deltas into real geometry as one undo step;
               * elements absent here are restored. `dRotation` is radians
               * about the element's bounding-box center.
               */
              commits?: {
                  drawdyElementId: string;
                  dx: number;
                  dy: number;
                  dRotation: number;
              }[];
          },
          { committed: number }
      >;
