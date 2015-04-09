import bag = require("bag-of-classes");

type BagClass = bag.MyClass;

export class PlainClass {
  static someStatic = 2;
  static otherStatic;
  public static accessorStatic = 5;
  private static andThis: bag.MyClass = "yuh";
}

module SomeModule {
  export module InnerModule {
    export interface SomeInterface<T, G> { }
  }
}

module HouseThing.Guy {
  var m = 5;
};

enum Suites {
  ["Oran" + "ge"],
  "Blue" = 77,
  Red = 1, Green,
  blue = (Green + 2)
}

declare class DeclaredClass {
  constructor();

  methodOnDeclaredClass(someParam: (Suites|(number|string))[]):number;
}

var a: { ():void; } = null;
var b: typeof a = null;

export interface OtherInterface<T> { }
interface SomeInterface extends OtherInterface<number> {
  [k:string]:number;
  (a, b):number;
  ():string;
  new(b):number;
}

interface TheMan {
  method(m: string):any;
}

export type HatMan = OtherInterface<number>|string;

var constructorThing: new(x)=>number = null;
declare; me(i, number);number;

var property = "property";
var booleanType: boolean = true;
var anyType: any = {};

export class WithExtendsAndInterface<A extends SomeModule.InnerModule.SomeInterface<number, string>, B> extends PlainClass implements bag.MyInterface, SomeModule.InnerModule.SomeInterface<SomeModule.InnerModule.SomeInterface<A, number|bag.MyClass[]>, bag.MyInterface> {
  memberWithoutAccessor = 5;
  memberWithType: string|number;
  memberWithGenerics: SomeModule.InnerModule.SomeInterface<number, string>;
  memberWithBlankFunctionType: ()=>void;
  memberWithFunctionType: <A>(m: string, ...c)=>SomeModule.InnerModule.SomeInterface<number, string>;
  memberWithAccessorType: { [key:number]:number; };
  memberWithInterfaceType: { hat: string; cow: number; };

  constructor(b: string|number, private c = 55, ...m: number[]) {
    super();
  }

  ["computed" + property]: number = 50;

  get propertyOne() {
    return 3;
  }

  set propertyOne(v) {

  }

  public methodOnClass(withParams, andMore: SomeModule.InnerModule.SomeInterface<number, string|number>):number {
    1 + 1;

    // Comment in the method.

    return 5;
  }

  boundMethod = ((five: number) => { return this.memberWithoutAccessor + five; });
}
