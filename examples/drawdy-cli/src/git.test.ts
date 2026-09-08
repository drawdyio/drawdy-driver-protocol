import { describe, expect, it } from "vitest";
import { parseGitRemote } from "./git";

describe("parseGitRemote", () => {
    it("parses ssh scp-style remotes", () => {
        expect(parseGitRemote("git@github.com:acme/my-ext.git")).toBe(
            "https://github.com/acme/my-ext"
        );
        expect(parseGitRemote("git@github.com:acme/my-ext")).toBe(
            "https://github.com/acme/my-ext"
        );
    });

    it("parses ssh url remotes", () => {
        expect(parseGitRemote("ssh://git@github.com/acme/my-ext.git")).toBe(
            "https://github.com/acme/my-ext"
        );
    });

    it("parses https remotes with and without .git", () => {
        expect(parseGitRemote("https://github.com/acme/my-ext.git")).toBe(
            "https://github.com/acme/my-ext"
        );
        expect(parseGitRemote("https://github.com/acme/my-ext")).toBe(
            "https://github.com/acme/my-ext"
        );
        expect(parseGitRemote("https://github.com/acme/my-ext/")).toBe(
            "https://github.com/acme/my-ext"
        );
        expect(parseGitRemote("https://www.github.com/acme/my.ext")).toBe(
            "https://github.com/acme/my.ext"
        );
    });

    it("rejects non-github and malformed remotes", () => {
        expect(parseGitRemote("https://gitlab.com/acme/my-ext.git")).toBeNull();
        expect(
            parseGitRemote("https://github.com/acme/my-ext/tree/main")
        ).toBeNull();
        expect(parseGitRemote("git@github.com:acme")).toBeNull();
        expect(parseGitRemote("")).toBeNull();
    });
});
