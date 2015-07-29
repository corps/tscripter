/// <reference path="node_modules/typescript/bin/typescript.d.ts" />

declare module "tscripter" {
    export import analyzer = require("lib/analyzer");
    export import statements = require("lib/statements");
}
