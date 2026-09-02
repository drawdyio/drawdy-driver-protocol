import {
    DriverCommandIssuer,
    ElementSchema,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { toDataUri } from "./slide-presets";

export function deckDomId(driverId: string): string {
    return `${driverId}:present-deck`;
}

export function deckPrevButtonId(driverId: string): string {
    return `${driverId}:present-prev`;
}

export function deckNextButtonId(driverId: string): string {
    return `${driverId}:present-next`;
}

export function deckLaserButtonId(driverId: string): string {
    return `${driverId}:present-laser`;
}

export function deckStopButtonId(driverId: string): string {
    return `${driverId}:present-stop`;
}

const LASER_TOOL_ID = "laser-pointer";

// Chevrons are Remix arrow-left/right-s-line, same as the app's deck.
const ICONS = {
    left: `<path d="M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z"/>`,
    right: `<path d="M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z"/>`,
    laser: `<circle cx="12" cy="14" r="3"/><path d="M11 4H13V8H11V4ZM5.63604 6.7218L7.05025 5.30759L9.87868 8.13602L8.46447 9.55023L5.63604 6.7218ZM16.9497 5.30759L18.364 6.7218L15.5355 9.55023L14.1213 8.13602L16.9497 5.30759Z"/>`,
    stop: `<rect x="6" y="6" width="12" height="12" rx="1.5"/>`,
} as const;

/**
 * Mirrors the real Presenter's show lifecycle: fullscreen on begin, a
 * bottom-center control deck, fly-to per slide, and the show ends whenever
 * fullscreen does (Esc included).
 */
export class PresentingController {
    private _active = false;
    private _index = 0;
    private _frameIds: string[] = [];
    private _laserActive = false;
    /** The tool that was active before the laser took over. */
    private _savedToolId: string | null = null;
    private _deckPosition: { x: number; y: number } | null = null;

    public constructor(
        private _args: {
            driverId: string;
            issueCommand: DriverCommandIssuer;
            nextRequestId: () => string;
            getStyling: () => ModuleStyling;
            getOrderedFrameIds: () => string[];
        }
    ) {}

    public get active(): boolean {
        return this._active;
    }

    public async begin(): Promise<void> {
        if (this._active) return;
        const frameIds = this._args.getOrderedFrameIds();
        if (frameIds.length === 0) return;
        this._frameIds = frameIds;
        this._index = 0;
        this._active = true;
        this._laserActive = false;
        this._savedToolId = null;

        // Mirrors the real presenter: the show goes on even when fullscreen
        // is refused.
        await this._args.issueCommand({
            type: "command:dom:enter-fullscreen",
            driverId: this._args.driverId,
            requestId: this._args.nextRequestId(),
        });
        // wait a little bit in case they have browser vertical left tabs opened.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await this._createDeck();
        await this._flyToCurrent();
    }

    public async back(): Promise<void> {
        if (!this._active || this._index === 0) return;
        this._index -= 1;
        await this._flyToCurrent();
    }

    public async forward(): Promise<void> {
        if (!this._active || this._index >= this._frameIds.length - 1) return;
        this._index += 1;
        await this._flyToCurrent();
    }

    public async toggleLaser(): Promise<void> {
        if (!this._active) return;
        const { issueCommand, driverId, nextRequestId } = this._args;

        if (!this._laserActive) {
            const { res } = await issueCommand({
                type: "command:tools:get-active",
                driverId,
                requestId: nextRequestId(),
            });
            this._savedToolId =
                res.error === undefined ? res.value.toolId : null;
            await issueCommand({
                type: "command:tools:set-active",
                driverId,
                requestId: nextRequestId(),
                req: { toolId: LASER_TOOL_ID },
            });
            this._laserActive = true;
        } else {
            await this._restoreTool();
        }
        // Static schemas can't restyle in place; rebuild the deck so the
        // laser button reflects its active state.
        await this._recreateDeck();
    }

    /** Fullscreen died (Esc or exit command): the show is over. */
    public async onFullscreenChanged(fullscreen: boolean): Promise<void> {
        if (!fullscreen && this._active) {
            await this.end({ exitFullscreen: false });
        }
    }

    public async end({ exitFullscreen = true } = {}): Promise<void> {
        if (!this._active) return;
        this._active = false;
        if (this._laserActive) {
            await this._restoreTool();
        }
        await this._args.issueCommand({
            type: "command:dom:remove-floating-element",
            driverId: this._args.driverId,
            requestId: this._args.nextRequestId(),
            req: { domId: deckDomId(this._args.driverId) },
        });
        if (exitFullscreen) {
            await this._args.issueCommand({
                type: "command:dom:exit-fullscreen",
                driverId: this._args.driverId,
                requestId: this._args.nextRequestId(),
            });
        }
    }

    private async _restoreTool(): Promise<void> {
        await this._args.issueCommand({
            type: "command:tools:set-active",
            driverId: this._args.driverId,
            requestId: this._args.nextRequestId(),
            req: { toolId: this._savedToolId ?? "select" },
        });
        this._savedToolId = null;
        this._laserActive = false;
    }

    private async _flyToCurrent(): Promise<void> {
        const frameId = this._frameIds[this._index];
        if (!frameId) return;
        await this._args.issueCommand({
            type: "command:camera:fly-to-elements",
            driverId: this._args.driverId,
            requestId: this._args.nextRequestId(),
            req: {
                drawdyElementIds: [frameId],
                flyDurationMs: 500,
                zoom: 1,
            },
        });
    }

    private async _createDeck(): Promise<void> {
        const { issueCommand, driverId, nextRequestId } = this._args;
        const { res: windowSize } = await issueCommand({
            type: "command:dom:window-size",
            driverId,
            requestId: nextRequestId(),
        });
        if (windowSize.error != null) return;

        // The floating element's left edge sits at position.x; offset by
        // half the deck's rendered width (4 28px buttons + divider + gaps +
        // padding ≈ 148px) to center it.
        this._deckPosition = {
            x: windowSize.value.width / 2 - 74,
            y: windowSize.value.height - 76,
        };
        await this._placeDeck();
    }

    private async _recreateDeck(): Promise<void> {
        await this._args.issueCommand({
            type: "command:dom:remove-floating-element",
            driverId: this._args.driverId,
            requestId: this._args.nextRequestId(),
            req: { domId: deckDomId(this._args.driverId) },
        });
        await this._placeDeck();
    }

    private async _placeDeck(): Promise<void> {
        if (!this._deckPosition) return;
        await this._args.issueCommand({
            type: "command:dom:create-floating-element",
            driverId: this._args.driverId,
            requestId: this._args.nextRequestId(),
            req: {
                domId: deckDomId(this._args.driverId),
                position: this._deckPosition,
                schema: this._deckSchema(),
                barrierDismissible: false,
            },
        });
    }

    private _deckSchema(): ElementSchema {
        const styling = this._args.getStyling();
        const driverId = this._args.driverId;

        const iconButton = (
            domId: string,
            icon: keyof typeof ICONS,
            active = false
        ): ElementSchema => ({
            type: "button",
            domId,
            styles: {
                backgroundColor: active ? styling.accent : styling.surface,
                borderRadius: [8, "px"],
                padding: [6, "px"],
                hover: {
                    backgroundColor: active ? styling.accent : styling.surface2,
                },
            },
            children: [
                {
                    type: "image",
                    child: toDataUri(
                        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="${active ? styling.accentForeground : styling.foreground}">${ICONS[icon]}</svg>`
                    ),
                    styles: {
                        width: [16, "px"],
                        height: [16, "px"],
                    },
                },
            ],
        });

        const divider: ElementSchema = {
            type: "box",
            styles: {
                width: [1, "px"],
                height: [20, "px"],
                backgroundColor: styling.border,
            },
        };

        return {
            type: "row",
            styles: {
                backgroundColor: styling.surface,
                borderColor: styling.border,
                borderType: "solid",
                borderWidth: [1, "px"],
                borderRadius: [10, "px"],
                padding: [8, "px"],
                gap: 4,
                crossAxisAlignment: "center",
            },
            children: [
                iconButton(deckPrevButtonId(driverId), "left"),
                iconButton(deckNextButtonId(driverId), "right"),
                divider,
                iconButton(
                    deckLaserButtonId(driverId),
                    "laser",
                    this._laserActive
                ),
                iconButton(deckStopButtonId(driverId), "stop"),
            ],
        };
    }
}
