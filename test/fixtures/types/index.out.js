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
var WithInterfaces = (function () {
    function WithInterfaces() {
    }
    return WithInterfaces;
})();
exports.WithInterfaces = WithInterfaces;
var WithExtendsAndInterface = (function (_super) {
    __extends(WithExtendsAndInterface, _super);
    function WithExtendsAndInterface() {
        var _this = this;
        _super.apply(this, arguments);
        this.memberWithoutAccessor = 5;
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
    // This one will be tricky.
    WithExtendsAndInterface.prototype.methodOnClass = function (withParams, andMore) {
        1 + 1;
        // Comment in the method.
        return 5;
    };
    return WithExtendsAndInterface;
})(PlainClass);
exports.WithExtendsAndInterface = WithExtendsAndInterface;
