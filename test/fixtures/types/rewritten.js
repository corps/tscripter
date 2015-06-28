var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var PlainClass = (function () {
    function PlainClass() {
    }
    PlainClass.someStatic = 2;
    PlainClass.accessorStatic = 5;
    PlainClass.andThis = "yuh";
    return PlainClass;
})();
exports.PlainClass = PlainClass;
var HouseThing;
(function (HouseThing) {
    var Guy;
    (function (Guy) {
        var m = 5;
    })(Guy = HouseThing.Guy || (HouseThing.Guy = {}));
})(HouseThing || (HouseThing = {}));
;
var Suites;
(function (Suites) {
    Suites[Suites["Oran" + "ge"] = 0] = "Oran" + "ge";
    Suites[Suites["Blue"] = 77] = "Blue";
    Suites[Suites["Red"] = 1] = "Red";
    Suites[Suites["Green"] = 2] = "Green";
    Suites[Suites["blue"] = 4] = "blue";
})(Suites || (Suites = {}));
var a = null;
var property = "property";
var WithExtendsAndInterface = (function (_super) {
    __extends(WithExtendsAndInterface, _super);
    function WithExtendsAndInterface(b, c) {
        var _this = this;
        if (c === void 0) { c = 55; }
        var m = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            m[_i - 2] = arguments[_i];
        }
        _super.call(this);
        this.c = c;
        this.memberWithoutAccessor = 5;
        this["computed" + property] = 50;
        this.boundMethod = (function (five) { return _this.memberWithoutAccessor + five; });
    }
    Object.defineProperty(WithExtendsAndInterface.prototype, "propertyOne", {
        get: function () {
            return 3;
        },
        set: function (v) {
        },
        enumerable: true,
        configurable: true
    });
    WithExtendsAndInterface.prototype.methodOnClass = function (withParams, andMore) {
        1 + 1;
        // Comment in the method.
        return 5;
    };
    return WithExtendsAndInterface;
})(PlainClass);
exports.WithExtendsAndInterface = WithExtendsAndInterface;
