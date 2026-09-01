import {
    DriverCommandIssuer,
    SubscribedDrawdyElement,
} from "@drawdy/driver-protocol";

type Rect = { x: number; y: number; width: number; height: number };

const isSlideFrame = (el: SubscribedDrawdyElement): boolean =>
    el.type === "frame" && typeof el.meta?.extensionSlideOrder === "number";

export class SlidePreviewTracker {
    private _frames = new Map<string, { order: number; rect: Rect | null }>();
    /** Which frame each activity subscription watches. */
    private _activitySubscriptionToFrame = new Map<string, string>();
    private _queue: Promise<void> = Promise.resolve();

    public constructor(
        private _args: {
            driverId: string;
            webviewId: string;
            issueCommand: DriverCommandIssuer;
            nextRequestId: () => string;
        }
    ) {}

    public has(frameId: string): boolean {
        return this._frames.has(frameId);
    }

    public getOrderedFrameIds(): string[] {
        return [...this._frames.entries()]
            .sort(
                (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0])
            )
            .map(([frameId]) => frameId);
    }

    /**
     * The order for the next new slide. Derived from the tracked slides, not
     * a session counter — a counter collides with slides that already existed
     * on the board (duplicate orders make the deck sort unstable).
     */
    public getNextOrder(): number {
        let max = 0;
        for (const { order } of this._frames.values()) {
            max = Math.max(max, order);
        }
        return max + 1;
    }

    public upsert(elements: readonly SubscribedDrawdyElement[]): boolean {
        let changed = false;
        for (const el of elements) {
            if (isSlideFrame(el)) {
                const order = el.meta!.extensionSlideOrder as number;
                const existing = this._frames.get(el.id);
                if (!existing) {
                    this._frames.set(el.id, { order, rect: null });
                    changed = true;
                } else if (existing.order !== order) {
                    existing.order = order;
                    changed = true;
                }
            } else if (this._frames.delete(el.id)) {
                changed = true;
            }
        }
        return changed;
    }

    public removeByIds(ids: readonly string[]): boolean {
        let changed = false;
        for (const id of ids) {
            changed = this._frames.delete(id) || changed;
        }
        return changed;
    }

    public rebuild(elements: readonly SubscribedDrawdyElement[]): void {
        this._frames.clear();
        this.upsert(elements);
    }

    public refresh(): void {
        this._enqueue(async () => {
            await this._syncRectsAndSubscriptions();
            await this._postDeck();
            for (const frameId of this._frames.keys()) {
                await this._captureAndPost(frameId);
            }
        });
    }

    /** An activity subscription fired: repaint the slide it watches. */
    public refreshBySubscription(subscriptionId: string): void {
        const frameId = this._activitySubscriptionToFrame.get(subscriptionId);
        if (!frameId) return;
        this._enqueue(async () => {
            await this._captureAndPost(frameId);
        });
    }

    private _enqueue(task: () => Promise<void>): void {
        this._queue = this._queue.then(task).catch((err) => {
            console.error("[drawdy-presentation] preview refresh failed", err);
        });
    }

    private async _syncRectsAndSubscriptions(): Promise<void> {
        const { issueCommand, driverId, nextRequestId } = this._args;

        const frameIds = [...this._frames.keys()];
        if (frameIds.length > 0) {
            const { res } = await issueCommand({
                type: "command:scene:element-rects",
                driverId,
                requestId: nextRequestId(),
                req: { drawdyElementIds: frameIds },
            });
            if (res.error !== undefined) {
                console.error(
                    `[drawdy-presentation] element-rects failed: ${res.error}`
                );
                return;
            }
            const byId = new Map(
                res.value.rects.map((r) => [r.drawdyElementId, r.rect])
            );
            for (const id of frameIds) {
                const rect = byId.get(id);
                if (rect) {
                    this._frames.get(id)!.rect = rect;
                } else {
                    // Vanished between the event and the query.
                    this._frames.delete(id);
                }
            }
        }

        for (const subscriptionId of this._activitySubscriptionToFrame.keys()) {
            await issueCommand({
                type: "command:subscription:remove",
                driverId,
                requestId: nextRequestId(),
                req: { subscriptionId },
            });
        }
        this._activitySubscriptionToFrame.clear();

        for (const [frameId, { rect }] of this._frames) {
            if (!rect) continue;
            const { res } = await issueCommand({
                type: "subscription:scene:activity",
                driverId,
                requestId: nextRequestId(),
                req: { rect },
            });
            if (res.error !== undefined) continue;
            this._activitySubscriptionToFrame.set(
                res.value.subscriptionId,
                frameId
            );
        }
    }

    private async _postDeck(): Promise<void> {
        const { issueCommand, driverId, webviewId, nextRequestId } = this._args;
        await issueCommand({
            type: "command:webview:post-message",
            driverId,
            requestId: nextRequestId(),
            req: {
                webviewDomId: webviewId,
                message: {
                    type: "slides",
                    slides: [...this._frames.entries()].map(
                        ([frameId, { order }]) => ({ frameId, order })
                    ),
                },
            },
        });
    }

    private async _captureAndPost(frameId: string): Promise<void> {
        const { issueCommand, driverId, webviewId, nextRequestId } = this._args;
        const frame = this._frames.get(frameId);
        if (!frame?.rect) return;

        const { res } = await issueCommand({
            type: "command:scene:capture-screenshot",
            driverId,
            requestId: nextRequestId(),
            req: { area: frame.rect },
        });
        if (res.error !== undefined) {
            console.error(
                `[drawdy-presentation] screenshot failed: ${res.error}`
            );
            return;
        }

        await issueCommand({
            type: "command:webview:post-message",
            driverId,
            requestId: nextRequestId(),
            req: {
                webviewDomId: webviewId,
                message: {
                    type: "slide-preview",
                    frameId,
                    order: frame.order,
                    png: res.value.png,
                },
            },
        });
    }
}
