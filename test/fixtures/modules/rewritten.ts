/// <reference path="./internal.ts" />

import { a, b as m } from "./external";
import B, * as externalTwoStar from "./external-2";
export import externalTwoRequire = require("fixtures/modules/external-2");
export import Inner = MyModule.InnerModule.FurtherInner;
import A = require("./external-single-export");

var a = 1;
var b = 2;
var c = 3;

export { a, b, c as D } from "./some-module";

export * from "./yet-another";

export = A;
