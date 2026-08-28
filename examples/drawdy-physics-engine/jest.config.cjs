/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testMatch: ["<rootDir>/src/**/?(*.)+(spec|test).ts?(x)"],
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "json"],
    transform: {
        "^.+\\.(m|c)?[tj]sx?$": [
            "@swc/jest",
            {
                jsc: {
                    parser: { syntax: "typescript", tsx: false, decorators: false },
                    target: "es2020"
                },
                module: { type: "commonjs" }
            }
        ]
    },
    transformIgnorePatterns: []
};
