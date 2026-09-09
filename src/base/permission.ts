import { DriverCommand } from "./command";

export type ProtocolPermission = "dom" | "scene" | "storage" | "secure-storage";
type ExactMatch<
    T extends Record<DriverCommand["type"], ProtocolPermission | "none">,
> = T;

export type ProtocolPermissionMap = ExactMatch<{
    "command:camera:get-info": "none";
    "command:camera:get-viewport-rect": "none";
    "command:camera:screen-to-canvas": "none";
    "command:camera:canvas-to-screen": "none";
    "command:camera:fly-to-elements": "none";
    "command:camera:fly-to-rect": "none";

    "command:dom:create-action-button": "dom";
    "command:dom:window-size": "dom";
    "command:dom:enter-fullscreen": "dom";
    "command:dom:exit-fullscreen": "dom";
    "command:dom:element-rect": "dom";
    "command:dom:create-floating-element": "dom";
    "command:dom:remove-floating-element": "dom";
    "command:dom:move-floating-element": "dom";

    "command:webview:create": "dom";
    "command:webview:hide": "dom";
    "command:webview:post-message": "dom";

    "command:context-menu:add": "dom";
    "command:context-menu:remove": "dom";

    "command:tools:get-active": "scene";
    "command:tools:set-active": "scene";
    "command:tools:update-settings": "scene";
    "command:tools:emulate-pointer": "scene";

    "command:history:undo": "scene";
    "command:history:redo": "scene";

    "command:scene:add-drawdy-elements": "scene";
    "command:scene:remove-drawdy-elements": "scene";
    "command:scene:update-drawdy-elements": "scene";
    "command:scene:get-drawdy-elements": "scene";
    "command:scene:get-image-source": "scene";
    "command:scene:query-rect": "scene";
    "command:scene:query-combined-rect": "scene";
    "command:scene:element-rects": "scene";
    "command:scene:capture-screenshot": "scene";
    "command:scene:set-selection": "scene";
    "command:scene:clear-selection": "scene";
    "command:scene:get-current-selected-drawdy-elements": "scene";
    "command:scene:cancel-text-edit": "scene";
    "command:scene:update-text-edit": "scene";
    "command:scene:begin-preview": "scene";
    "command:scene:preview-transforms": "scene";
    "command:scene:end-preview": "scene";
    "command:scene:create-drawdy-preview-elements": "scene";
    "command:scene:update-drawdy-preview-elements": "scene";
    "command:scene:delete-drawdy-preview-elements": "scene";
    "command:scene:query-tool-style-state": "scene";

    "command:kv-storage:set": "storage";
    "command:kv-storage:get": "storage";
    "command:kv-storage:delete": "storage";

    "command:secure-storage:set": "secure-storage";
    "command:secure-storage:get": "secure-storage";
    "command:secure-storage:delete": "secure-storage";

    "command:subscription:remove": "none";

    "subscription:camera:moved-rapid": "none";
    "subscription:camera:moved-debounced": "none";

    "subscription:dom:element-clicked": "dom";
    "subscription:dom:pointer": "dom";
    "subscription:dom:drag": "dom";
    "subscription:dom:theme-changed": "dom";
    "subscription:dom:fullscreen-changed": "dom";
    "subscription:dom:screen-resized": "dom";

    "subscription:webview:message": "dom";
    "subscription:context-menu:clicked": "dom";
    "subscription:keyboard:control-keys": "dom";

    "subscription:scene:elements-added": "scene";
    "subscription:scene:elements-removed": "scene";
    "subscription:scene:elements-replaced": "scene";
    "subscription:scene:elements-updated": "scene";
    "subscription:scene:activity": "scene";
    "subscription:scene:pointer": "scene";
    "subscription:scene:click": "scene";
    "subscription:scene:text-edit": "scene";
    "subscription:scene:drawdy-element-selection": "scene";
    "subscription:scene:drawdy-elements-dragged": "scene";
}>;
