/**
  Contains all CodeNode definitions used to decompose and write code.
  Most important basic classes are the CodeNode and AbstractBlocks, from
  which other concepts are composed.
*/

import * as ts from "typescript";

/**
  Interface describing the json rendering of CodeNode, used mostly in
  tests.
*/
export interface CodeNodeJSON {
  /** Name of the constructor class for the given node. */
  constructorName: string
  /** Contains JSON serializable attributes of a CodeNode */
  data: { [k: string]: any }
}

/**
  The base representation of a "node" in typescript semantics.  This maps
  similarly to ts.Node from typescript itself, but the exact blocks and types
  differ in favor of convenience of composing / transforming code, rather than
  strictly capturing TypeScript grammar.

  When analyzing a source file, typescript will provide the ts.Node used to
  construct any CodeNode, but one should be careful to check the Node.kind
  before assuming the exact type of the underlying ts.Node.
*/
export class CodeNode {
  /**
    The last canonical 'rendering' of the node.  When a node is analyzed from
    existing code it will represent exactly what was in the source.
    For new nodes, or dirtied nodes, calling toString() will set this based
    on tscripter's owner rendering via buildString().
  */
  public text: string;

  constructor(public node?: ts.Node) { }

  /** convenience method for setting the 'rendering' of a node, used by the analyzer */
  setText(text: string) {
    this.text = text;
    return this;
  }

  /** convenience method for setting the ts.Node from which the analyzer constructed the node. */
  registerWithNode(node: ts.Node) {
    this.node = node;
    return this;
  }

  /**
  @returns a rendering of the node and it's attributes into a CodeNodeJSON shaped object.
  All attributes of a code node, save the following metadata, are serialized out to the
  resulting data: node, bodyHasBeenAnalyzed, text, any starting with _
  Any attributes that are themselves CodeNode's will be serialized according to the
  CodeNodeJSON interface.
  */
  toJSON(): CodeNodeJSON {
    var result: CodeNodeJSON = {
      constructorName: (<any>this)["constructor"]["name"],
      data: {}
    }

    for (var k in this) {
      if (!this.hasOwnProperty(k)) continue;
      if (k[0] == "_") continue;
      if ([
        "node",
        "bodyHasBeenAnalyzed",
        "text"
      ].indexOf(k) != -1) {
        continue;
      }
      var val = (<any>this)[k];

      if (val instanceof CodeNode) {
        result.data[k] = val.toJSON();
      } else if (val instanceof Array) {
        result.data[k] = val.map((s: any) => {
          return JSON.parse(JSON.stringify(s === undefined ? null : s));
        });
      } else {
        try {
          result.data[k] = JSON.parse(JSON.stringify(val === undefined ? null : val));
        } catch (e) {
          throw new Error("Problem parsing key " + k + ": data was " + val);
        }
      }
    }


    return result;
  }

  /** @returns all non null children by filtering buildChildren() */
  getChildren(): CodeNode[] { return this.buildChildren().filter((s) => s != null) }

  /** @returns an array containing all immediate children, including nulls for empty children. */
  buildChildren(): CodeNode[] { return []; }

  /**
  For any derived class of CodeNode, will set text to null, forcing the next call to toString()
  to rerender the node using buildString().  Note that because CodeNode itself is used as a
  fallback for any syntax not understood by tscripter, marking it dirty cannot erase
  the text for typescript will have no idea how to re-render it.

  This method should be called **anytime an attribute or child** is modified or has its text
  rendering changed.  This is to increase the efficiency of transforming small details of
  potentially large files.  When in doubt, use recursive = true to ensure the absolute most
  up to date rendering via toString().

  @param recursive
  when true, will also act recursively by calling walkChildren.
  */
  markDirty(recursive = false) {
    if (this.constructor == CodeNode) return this;
    this.text = null;
    if (recursive) {
      this.walkChildren((c) => {
        c.markDirty();
      });
    }
    return this;
  }

  /**
  @returns the current cached rendering of the CodeNode.  When text is non null,
  it will simply return that.  Otherwise, it will call buildString() and cache that value
  into text before returning it.
  */
  toString(): string {
    return this.text == null ? (this.text = this.buildString()) : this.text;
  }

  /**
  @returns the tscripter rendering of the current node.  Note that child nodes
  are themselves rendered via toString() and thus will use their last cached rendering.
  Use markDirty to reset children if necessary before calling.
  */
  buildString(): string {
    throw new Error("No text found for statement");
  }

  /**
  Recursively walks this node's children breadth first searching for a node for which
  predicateF returns true.

  @param predicateF given each CodeNode traversed and determines when the search should complete.
  @param includeSelf iff true, this node will also be traversed.
  @returns the first CodeNode, or null, that meets the condition given by predicateF.
  */
  findChild(predicateF: (s: CodeNode) => boolean, includeSelf = false): CodeNode {
    var queue: CodeNode[] = [];
    if (includeSelf) {
      queue = [this];
    } else {
      queue = this.getChildren().slice(0);
    }

    while (queue.length) {
      var next = queue.shift();
      if (next == null) continue;
      if (predicateF(next)) return next;
      Array.prototype.push.apply(queue, next.getChildren());
    }
  }

  /**
    Exactly the same as findChild, only that it always walks every child calling
    the given walker for each CodeNode.
    @param walker called with each CodeNode encountered.
  */
  walkChildren(walker: (s: CodeNode) => void, includeSelf = false) {
    this.findChild((n) => {
      walker(n);
      return false;
    }, includeSelf);
  }

  /**
    Most nodes typically use the ; to indicate statement termination, but
    some special cases (specifically code blocks themselves) do not.

    @returns the string to be appended to the end of this CodeNode when it
    appears as a block level statement.
  */
  statementLevelTerminal() {
    return ";";
  }
}

/**
  Represents a "block" of CodeNodes.
  Subclasses of AbstractBlock will not have the elements of their body analyzed
  by default unless true is provided for the analyzer's recursive argument.  Instead,
  one should call the analyzeBody method with the abstract block in question
  to fill its elements out.
*/
export class AbstractBlock extends CodeNode {
  /** used to indicate wether typescript has yet to analyze the contents of the block's ts.Node. */
  bodyHasBeenAnalyzed = false;
  /** the statement, expression, or declaration CodeNodes that belong to the block */
  elements: CodeNode[] = [];

  buildString(): string {
    throw new Error("Block is abstract -- subclasses must implement buildString!");
  }

  buildChildren(): CodeNode[] {
    return this.elements.slice(0);
  }

  statementLevelTerminal() {
    return "";
  }

  /**
    Used by the analyzer to decide wether a block has been analyzed.  when this returns false,
    analyzing the body of a block will result in a no-op.
  */
  canAnalyzeBody() {
    return !this.bodyHasBeenAnalyzed && this.elements.length == 0;
  }


  /** clears the body of the block and resets its bodyHasBeenAnalyzed state to false */
  resetBody() {
    this.elements = [];
    this.bodyHasBeenAnalyzed = false;
  }
}

/**
  A type of Block whose elements are Statements, and thus should be terminated by
  their corresponding statementLevelTerminal().
*/
export class AbstractStatementBlock extends AbstractBlock {
  buildString(): string {
    return this.elements.map((s: CodeNode) => {
      return s.toString() + s.statementLevelTerminal();
    }).join("");
  }
}

/**
  The most common type of StatementBlock that begins and ends with { }
*/
export class CodeBlock extends AbstractStatementBlock {
  buildString() {
    return "{" + super.buildString() + "}";
  }
}

/**
  Expression Blocks differ in that their elements are separated by commas, and not
  terminated via the statementLevelTerminal.
*/
export class AbstractExpressionBlock extends AbstractBlock {
  buildString(): string {
    var lastNoSpaceIdx = -1;
    var parts = this.elements.map((v, i) => {
      if (!(v instanceof Trivia)) {
        lastNoSpaceIdx = i;
        return v + ",";
      }
      return v.toString();
    });

    if (lastNoSpaceIdx >= 0) {
      var text = parts[lastNoSpaceIdx];
      parts[lastNoSpaceIdx] = text.substr(0, text.length - 1);
    }

    return parts.join("");
  }
}

export class SimpleNode extends CodeNode {
  constructor(public token: string) {
    super();
  }

  buildString() { return this.token; }
}

/** Keywords are reserved tokens that are not expressions or types */
export class Keyword extends SimpleNode { }

/** An odd mapping for "empty" statements / expressions that contain nothing but a potential terminal */
export class EmptyExpression extends SimpleNode {
  constructor() {
    super("");
  }
}

/**
  The top level node of a source file, containing all the statements of that
  file.
*/
export class Source extends AbstractStatementBlock {
  constructor(public fileName: string) {
    super();
  }

  /** convenience accessor for the corresponding ts.SourceFile */
  get sourceNode(): ts.SourceFile {
    return <ts.SourceFile>this.node;
  }

  /** returns a version of the Block's buildString() that always includes a trailing new line. */
  buildString() {
    var result = super.buildString();
    if (result[result.length - 1] != "\n") {
      result += "\n";
    }
    return result;
  }
}

export type ModuleDeclarationName = QualifiedName|AtomicValue;

/**
  Represents module MyModule {} or module "happy" {} blocks, based on the type of the name.
*/
export class Module extends CodeBlock {
  constructor(public name: ModuleDeclarationName, public modifiers: string[] = []) {
    super();
  }

  buildString() {
    return this.modifiers.concat(["module", this.name.toString(), super.buildString()]).join(" ");
  }

  buildChildren() {
    return super.buildChildren().concat([<QualifiedName>this.name]);
  }
}

/**
  Represents 'internal' module imports, ala
  import MyHat = Body.Head.Hat;
*/
export class InternalModuleImport extends CodeNode {
  constructor(public symbolName: string, public moduleName: QualifiedName, public modifiers: string[] = []) {
    super();
  }

  buildString(): string {
    return this.modifiers.concat(["import", this.symbolName, "=", this.moduleName.toString()]).join(" ");
  }

  buildChildren() {
    return super.buildChildren().concat([this.moduleName]);
  }
}

/**
  Represents 'External' Module imports via CommonJS require.
  import fs = require("fs")
*/
export class RequireImport extends CodeNode {
  constructor(public importedAs: Identifier, public importPath: Expression, public modifiers: string[] = []) {
    super();
  }

  buildString(): string {
    return this.modifiers.concat(["import", this.importedAs.toString(), "=", "require(" + this.importPath + ")"]).join(" ");
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.importPath, this.importedAs]);
  }
}

/**
  A dot separated qualification of names used for types and modules, never expressions.
*/
export class QualifiedName extends CodeNode {
  /**
  @param name the farthest right name of this type.
  @param qualification the QualifiedName that precedes the name and is separated via a dot.
  */
  constructor(public name: string, public qualification?: QualifiedName) {
    super();
  }

  buildString(): string {
    if (this.qualification == null) {
      return this.name;
    } else {
      return this.qualification + "." + this.name;
    }
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.qualification]);
  }

  /**
  returns an equivalent CodeNode representing an expression form of this name.
  The text and node is preserved.
  */
  asExpression(): Expression {
    var result: Expression;
    if (this.qualification == null) {
      result = new Identifier(this.name);
    } else {
      result = new PropertyAccess(this.qualification.asExpression(), this.name);
    }
    result.registerWithNode(this.node).setText(this.text);
    return result;
  }

  /** returns the QualifiedTypeName of this QualifiedName with not type parameters. */
  asTypeName() {
    return new QualifiedTypeName(this);
  }
}

/** One of the three built in keyword types, boolean, string, or number. */
export class KeywordType extends SimpleNode {
  static boolean = new KeywordType("boolean");
  static string = new KeywordType("string");
  static number = new KeywordType("number");
}

/** A wrapping of a QualifiedName that may include type parameters.  */
export class QualifiedTypeName extends CodeNode {
  constructor(public name: QualifiedName, public typeParameters: Type[] = []) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.typeParameters).concat([this.name]);
  }

  buildString() {
    var result = this.name.buildString();
    if (this.typeParameters && this.typeParameters.length > 0) {
      result += "<" + this.typeParameters.map((s) => { return s.toString(); }).join(", ") + ">"
    }
    return result;
  }

  /** returns an equivalent New expression invoking the name and typeParameters, using the given args */
  asNew(args: Expression[] = []) {
    return new New(new Call(this.name.asExpression(), args, this.typeParameters));
  }

  /** Convenience for QualifiedTypeNames without qualifications or typeParameters */
  static fromSimpleName(name: string) {
    return new QualifiedTypeName(new QualifiedName(name));
  }
}

/** A type given by an array of it's elementType eg string[] */
export class ArrayType extends CodeNode {
  constructor(public elementType: Type) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.elementType]);
  }

  buildString(): string {
    return this.elementType + "[]";
  }
}

/** Represents unions of types separated via | */
export class UnionType extends CodeNode {
  constructor(public names: Type[]) {
    super();
  }

  buildString(): string {
    return this.names.map(n => n.toString()).join("|");
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.names);
  }
}

/** A peculiar type expression clarification used in Array or Union types eg (string | number)[] */
export class ParenthesizedType extends CodeNode {
  constructor(public type: Type) {
    super();
  }

  buildChildren(): CodeNode[] { return super.buildChildren().concat([this.type]) }

  buildString(): string { return "(" + this.type + ")"; }
}

/** a union type containing all valid 'Type' CodeNodes */
export type Type = ParenthesizedType|QualifiedTypeName|UnionType|CallableType|TypeLiteral|ArrayType|KeywordType|TupleType|TypeOf;

/** Represents a tuple type eg [string, number] */
export class TupleType extends CodeNode {
  constructor(public types: Type[] = []) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.types);
  }

  buildString(): string {
    return "[" + this.types.map(s => s.toString()).join(", ") + "]";
  }
}

/** an expression that alias's a type eg type Me = You */
export class TypeAlias extends CodeNode {
  constructor(public name: string, public type: Type, public modifiers: string[] = []) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.type]);
  }

  buildString() {
    return this.modifiers.concat(["type", this.name, "=", this.type.toString()]).join(" ");
  }
}

/** A declaration used to define an enum value, the most common children of Enumeration blocks. */
export class EnumEntry extends CodeNode {
  constructor(public name: ElementDeclarationName, public initializer?: Expression) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.initializer, this.name]);
  }

  buildString() {
    if (this.initializer) {
      return `${this.name} = ${this.initializer}`;
    } else {
      return this.name.toString();
    }
  }
}

/** A block mostly composed of EnumEntries, eg enum { RED = 1 }*/
export class Enumeration extends AbstractExpressionBlock {
  constructor(public name: string, public modifiers: string[] = []) {
    super();
  }

  buildString() {
    return this.modifiers.concat(["enum", this.name, "{"]).join(" ") + super.buildString() + "}";
  }
}

/** A single type parameter representing its name and extends constraint */
export class TypeParameter extends CodeNode {
  constructor(public name: string, public typeConstraint?: Type) {
    super();
  }

  toString() {
    var result = this.name;
    if (this.typeConstraint != null) result += " extends " + this.typeConstraint;
    return result;
  }

  buildChildren() {
    return super.buildChildren().concat([this.typeConstraint]);
  }
}

/**
  A type representing an anonymous interface eg { a: number, b: string }
  Elements are generally Trivia or PropertyIndexOrCallables.
*/
export class TypeLiteral extends CodeBlock {
}

/** A block describing an interface, whose children are generally Properties */
export class Interface extends CodeBlock {
  constructor(
    public name: string,
    public typeParameters: TypeParameter[] = [],
    public extendedInterfaces: QualifiedTypeName[] = [],
    public modifiers: string[] = []
    ) {
    super();
  }

  buildString(): string {
    return this.buildDeclarationHead() + " " + super.buildString();
  }

  buildChildren() {
    return super.buildChildren().concat(this.typeParameters).concat(this.extendedInterfaces);
  }

  private buildDeclarationHead(): string {
    var result = (this.modifiers || []).concat(["interface", this.name]).join(" ");

    if (this.typeParameters.length > 0) {
      result += "<" + this.typeParameters.map(s => s.toString()).join(", ") + ">";
    }

    if (this.extendedInterfaces.length > 0) {
      result += " extends " + this.extendedInterfaces.map(i => i.toString()).join(", ");
    }
    return result;
  }
}

export class AbstractCallableSignature extends CodeNode {
  /**
  @param name the declaration name for the signature, or anonymous when null.
  @param isOptional when true, the signature is rendered with a ? as for optional
  interface elements.
  */
  constructor(
    public name?: DeclarationName,
    public args: Property[] = [], public returnType?: Type,
    public typeParameters: TypeParameter[] = [],
    public isOptional = false
    ) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.args).concat(this.typeParameters).concat([this.returnType, this.name]);
  }

  buildString() {
    var result = this.name != null ? this.name.toString() : "";
    if (this.isOptional) result += "?";
    if (this.typeParameters.length > 0) {
      result += "<" + this.typeParameters.map(s => s.toString()).join(", ") + ">";
    }
    result += "(" + this.args.map(s => s.toString()).join(", ") + ")";

    if (this.isPropertyType() || this.returnType != null) {
      result += this.returnTypeSeparator();
      if (this.returnType != null) {
        result += this.returnType.toString();
      } else {
        result += "void";
      }
    }
    return result;
  }

  private returnTypeSeparator() {
    return this.isPropertyType() ? "=>" : ":";
  }

  protected isPropertyType(): boolean { return false; }
}

/**
  A type of CallableSignature used to explain a callable expression, such as a lambda, or method
  eg: var f = (a: number): string => { return ""; }  , myMethod(): number { return 3; }

  The difference between a CallableSignature and a CallableType is wether the return value
  can be expressed using an => or a :.
  */
export class CallableSignature extends AbstractCallableSignature {
  _callableSignature = true;

  protected isPropertyType() { return false; }
}

/**
  A type of CallableSignature used to explain a callable property type.
  eg: { myMethod: () => string }

  The difference between a CallableSignature and a CallableType is wether the return value
  can be expressed using an => or a :.
  */
export class CallableType extends AbstractCallableSignature {
  _callableType = true;

  protected isPropertyType() { return true; }
}

export type Callable = CallableSignature|CallableType;

/**
  Describes a function that uses traditional function () {} syntax without the => binding
  semantics. Its elements are considered to be statements and are terminated via ;
*/
export class Function extends CodeBlock {
  /**
  @param name the name of the function, can be null to represent anonymous functions.
  @param callableSignature the signature of the function
  @param modifiers the string modifiers preceeding the function, such as export, private, etc
  @param isMethod when true AND name is null, the token 'function' is not rendered.
  @param declaredOnly when true, the body {} is not rendered and the statement is terminated via ;
  Used for ambient function declarations;
   */
  constructor(
    public callableSignature: CallableSignature,
    public modifiers: string[] = [],
    public isMethod = false,
    public declaredOnly = false,
    public decorators: Expression[] = []
    ) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat(this.decorators).concat([this.callableSignature]);
  }

  buildString() {
    var result = this.buildDeclarationHead();
    if (!this.declaredOnly) {
      result += " " + super.buildString();
    }
    return result;
  }

  private buildDeclarationHead() {
    var functionHeading = this.isMethod ? "" : "function ";
    return this.decorators.map(d => "@" + d)
      .concat(this.modifiers)
      .concat([functionHeading]).join(" ") + this.callableSignature;
  }

  statementLevelTerminal() {
    return this.declaredOnly ? ";" : "";
  }
}

/**
  Similar to the Function, but uses => lambda semantics.
*/
export class Lambda extends CodeBlock {
  /**
  @param isSingleExpression when true, the lambda is rendered without containing block brackets {}.
  Only valid for blocks that contain one statement and spacing that contains no new lines.
  param withoutParanthesis when this is true, the rendered lambda excludes paranthesis around
  its signature.
  @param withoutParanthesis when true, the parameters of the signature are rendered without
  parenthesis.
  */
  constructor(public callableSignature: CallableSignature,
    public isSingleExpression = false,
    public withoutParanthesis = false) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.callableSignature]);
  }

  buildString() {
    var result = this.callableSignature.toString();
    if (this.withoutParanthesis && result[0] == "(")
      result = result.substring(1, result.length - 1);
    result += " =>";

    if (this.isSingleExpression) {
      result += AbstractExpressionBlock.prototype.buildString.apply(this);
    } else {
      result += " " + super.buildString();
    }
    return result;
  }

  statementLevelTerminal() {
    if (this.isSingleExpression) return ";";
    return "";
  }
}

/**
  A property represents a declaration of a variable or member within a container.
  Properties are used to declare arguments of functions and members of classes.
  In ambient declarations, the 'type' of a property can also be an AtomicValue.
*/
export class Property extends CodeNode {
  constructor(
    public name: DeclarationName, public type?: PropertyTypeQuery, public initializer?: CodeNode,
    public modifiers: string[] = [], public decorators: Expression[] = [],
    public optional: boolean = false, public dotDotDot: boolean = false
    ) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat(this.decorators).concat([this.type, this.initializer, this.name]);
  }

  buildString(): string {
    var name = this.name.toString();
    if (this.dotDotDot) name = "..." + name;
    var result = this.decorators.map(d => "@" + d).concat(this.modifiers).concat([name]).join(" ");
    if (this.optional) result += "?";
    if (this.type != null) result += ": " + this.type;
    if (this.initializer != null) result += " = " + this.initializer;
    return result;
  }
}

export type PropertyTypeQuery = Type|AtomicValue;

/**
  Represents an assignment to the export keyword.
*/
export class ExportAssignment extends CodeNode {
  constructor(public expression: Expression, public isDefault = false) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.expression]);
  }

  buildString() {
    return "export " + (this.isDefault ? "default " : "= ") + this.expression;
  }
}

/**
  Represents the indexing type of an interface or type literal.
  eg interface MyDict { [k:string]: number }
*/
export class Index extends CodeNode {
  constructor(public keyName: string, public keyType: Type, public valueType: Type) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.keyType, this.valueType]);
  }

  buildString() {
    return "[" + this.keyName + ":" + this.keyType + "]:" + this.valueType;
  }
}

export type PropertyIndexOrCallable = Property|Index|CallableSignature;

/** A class block, generally containing declarations, properties, and functions */
export class Class extends CodeBlock {
  constructor(
    public name: string,
    public modifiers: string[] = [],
    public parentClass?: QualifiedTypeName,
    public typeParameters: TypeParameter[] = [],
    public implementedInterfaces: QualifiedTypeName[] = [],
    public decorators: Expression[] = []
    ) {
    super();
  }

  buildChildren() {
    return super.buildChildren()
      .concat(this.typeParameters)
      .concat(this.implementedInterfaces)
      .concat(this.decorators)
      .concat([this.parentClass]);
  }

  buildString(): string {
    var heading = this.decorators.map(d => "@" + d);
    heading.push(this.buildDeclarationHead());
    var result = heading.join("\n");
    result += " " + super.buildString();
    return result;
  }

  get classNode(): ts.ClassElement {
    return <ts.ClassElement>this.node;
  }

  private buildDeclarationHead(): string {
    var result = (this.modifiers || []).concat(["class", this.name]).join(" ");

    if (this.typeParameters.length > 0) {
      result += "<" + this.typeParameters.map(s => s.toString()).join(", ") + ">";
    }

    if (this.parentClass) {
      result += " extends " + this.parentClass;
    }
    if (this.implementedInterfaces.length) {
      result += " implements " + this.implementedInterfaces.map(i => i.toString()).join(", ");
    }
    return result;
  }
}

/**
  Trivia represents any whitespace trivia included before or after other CodeNode's
  in blocks. They are preserved as separate nodes so as to make transformation while
  retaining code style more plausible.
*/
export class Trivia extends SimpleNode {
  statementLevelTerminal() { return ""; }
}

/**
  Represents a set of names being imported or export from an ES6 module,
  where each part can be either
  * a single element array mapping an Identifier "as is", eg B
  * a two element array mapping an Identifier to a naming one identifier as another, eg A as B
*/
export class NamedImportOrExports extends CodeNode {
  /**
  @param parts each element should be either a single Identifier being imported / exported
  under the same name as it was defined, or a pair of Identifiers mapping the definition
  Identifier 'as' another Identifier.
  */
  constructor(public parts: ([Identifier]|[Identifier, Identifier])[] = []) {
    super();
  }

  buildString(): string {
    return "{ " + this.parts.map((t) => {
      if (t[1] == null) {
        return t[0].toString()
      } else {
        return t[0] + " as " + t[1];
      }
    }).join(", ") + " }";
  }

  buildChildren(): CodeNode[] {
    var parts = this.parts.reduce((p, next) => {
      Array.prototype.push.apply(p, next);
      return p;
    }, []);

    return super.buildChildren().concat(parts);
  }
}

/**
  Represents a module being bound "ES6" style via the wildcard token, eg * as MyModule
*/
export class NamespaceBinding extends CodeNode {
  constructor(public name: Identifier) {
    super();
  }

  buildString(): string {
    return "* as " + this.name;
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.name]);
  }
}

export type ImportExportsBinding  = NamespaceBinding|NamedImportOrExports;

/** Represents ES6 style external module imports in the form of import yDefault, * as X from Y */
export class ES6Import extends CodeNode {
  constructor(
    public importPath: Expression,
    public defaultImportedAs?: Identifier,
    public namespaceBinding?: ImportExportsBinding,
    public modifiers: string[] = []) {
    super();
  }

  buildString(): string {
    var bindings: string[] = [];
    if (this.defaultImportedAs) bindings.push(this.defaultImportedAs.toString())
    if (this.namespaceBinding) bindings.push(this.namespaceBinding.toString());

    return this.modifiers.concat(["import", bindings.join(", "), "from", this.importPath.toString()]).join(" ");
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.importPath, this.defaultImportedAs, this.namespaceBinding]);
  }
}

/**
  Represents the ES6 export declaration, eg
  export { A, B as C } from "./module"
*/
export class ExportDeclaration extends CodeNode {
  constructor(public bindings?: ImportExportsBinding, public importPath?: Expression) {
    super();
  }

  buildString(): string {
    var result = "export ";
    if (this.bindings != null) result += this.bindings
    else result += "*";
    if (this.importPath != null) {
      result += " from " + this.importPath;
    }

    return result;
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.importPath, this.bindings]);
  }
}

/**
  Represents the simple ES6 import with no bindings, eg
  import "./this-module";
*/
export class SimpleImport extends CodeNode {
  constructor(public importPath: Expression) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.importPath]);
  }

  buildString(): string {
    return "import " + this.importPath;
  }
}

export type Import = SimpleImport|ES6Import;

export type Expression = TypeAssertion|New|ElementAccess|ObjectLiteral|RegexLiteral|ArrayLiteral|TemplatePattern|AtomicValue|Identifier|UnaryOperation|BinaryOperation|Parenthetical|TernaryOperation|PropertyAccess|Call|TaggedTemplate|EmptyExpression;

/**
  Represents an 'atomic' literal, a value which cannot be decomposed further, such
  as strings, numbers, booleans, or null / undefined.
*/
export class AtomicValue extends SimpleNode {
  _isLiteral = true;

  constructor(token: string) {
    super(token);
  }

  setValue(contents: string|number|boolean) {
    this.token = AtomicValue.toToken(contents);
  }

  getValue() {
    return AtomicValue.fromToken(this.token);
  }

  public static fromToken(token: string): string|number|boolean {
    return eval(token);
  }

  public static toToken(thing: string|number|boolean): string {
    if (thing === undefined) return "undefined";
    return JSON.stringify(thing);
  }
}

/**
  A regular expression literal.  Convenience method fromRegex can build this correctly
  from a given literal of your own.
*/
export class RegexLiteral extends CodeNode {
  constructor(public body: string, public flags: string[]) {
    super();
  }

  static fromRegex(regex: RegExp) {
    var body = regex.source;

    var parts = regex.toString().split("/");
    var flags = parts[parts.length - 1].split("");
    return new RegexLiteral(body, flags);
  }

  asRegex() {
    return new RegExp(this.body, this.flags.join(""));
  }

  buildString() {
    return "/" + this.body + "/" + this.flags.join("");
  }
}

export class ArrayLiteral extends AbstractExpressionBlock {
  buildString(): string {
    return "[" + super.buildString() + "]";
  }
}

/**
  Represents a variable identifier name.
*/
export class Identifier extends SimpleNode {
  _isIdentifier = true;
}

/**
  Represents a parenthesis around an expression.
*/
export class Parenthetical extends CodeNode {
  constructor(public expression: Expression) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.expression]);
  }

  buildString(): string {
    return "(" + this.expression.buildString() + ")";
  }
}

/**
  Represents a text literal composing a template.
  Templates consist of variable interpolation and literal pieces
  interweaved.
*/
export class TemplateLiteralPiece extends CodeNode {
  constructor(public value: string) {
    super();
  }

  public static asToken(value: string) {
    return value.replace(/`/g, "\\$&");
  }

  public static asText(value: string) {
    return value.replace(/\\`/g, "`");
  }

  buildString() {
    return TemplateLiteralPiece.asToken(this.value);
  }

  public static fromToken(token: string) {
    return new TemplateLiteralPiece(TemplateLiteralPiece.asText(token));
  }
}

/**
  A union type of possible pieces to a template, including the
  literal template strings and the expressions captured for
  interpolation.
*/
export type TemplatePart = TemplateLiteralPiece|Expression

/**
  See TemplateLiteralPiece and TemplatePart.  These compose typescript
  string templates, eg `hi ${name}`
*/
export class TemplatePattern extends CodeNode {
  constructor(public parts: TemplatePart[] = []) {
    super();
  }

  buildString(): string {
    return "`" + this.parts.map((v) => {
      if (v instanceof TemplateLiteralPiece) return v.toString();
      return "${" + v.toString() + "}";
    }).join("") + "`";
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.parts);
  }
}

/**
  Represents the ES6 tagged template construct, in which a function identifier
  is placed before a template pattern, eg i18n `hello world!`
*/
export class TaggedTemplate extends CodeNode {
  constructor(public tagF: Expression, public template: TemplatePattern) {
    super();
  }

  buildString(): string {
    return this.tagF + " " + this.template;
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.tagF, this.template]);
  }
}

/**
  Represents single parameter operations such as !.
*/
export class UnaryOperation extends CodeNode {
  /**
  param postfix when true, the operator comes at the end of the expression, otherwise the beginning.
  */
  constructor(public operator: string, public expression: Expression, public postfix: boolean) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.expression]);
  }

  buildString(): string {
    if (this.postfix) {
      return this.expression.toString() + this.operator;
    } else {
      return this.operator + this.expression.toString();
    }
  }
}

/**
  Convenience case of UnaryOperation representing a return.
*/
export class Return extends UnaryOperation {
  /**
  param expression when given, provides the value for the return.
  */
  constructor(expression?: Expression) {
    super(expression ? "return " : "return", expression || new Identifier(""), false);
  }
}

/**
  Convenience case of UnaryOperation representing a throw.
*/
export class Throw extends UnaryOperation {
  constructor(expression: Expression) {
    super("throw ", expression, false);
  }
}

/**
  Represents an operation taking a left and right expressions separated by an operator.
*/
export class BinaryOperation extends CodeNode {
  constructor(public operator: string, public left: Expression, public right: Expression) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.left, this.right]);
    ;
  }

  buildString(): string {
    return [this.left.toString(), this.operator, this.right.toString()].join(" ");
  }
}

/** Represents an attribute access of a left side expression, eg myCall().a */
export class PropertyAccess extends CodeNode {
  constructor(public expression: Expression, public property: string) {
    super();
  }

  buildString(): string {
    return this.expression.toString() + "." + this.property.toString()
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.expression]);
  }
}

/** Represents a ternary operation, taking two operator and three expressions. */
export class TernaryOperation extends CodeNode {
  constructor(public operators: [string, string], public expressions: [Expression, Expression, Expression]) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.expressions);
  }

  buildString(): string {
    return [
      this.expressions[0], this.operators[0],
      this.expressions[1], this.operators[1],
      this.expressions[2]
    ].join(" ");
  }
}

/**
Represents the invocation of an expression with the given args and type arguments.
*/
export class Call extends CodeNode {
  /**
  param args when null, the parenthesis will not be present in the invocation, as
  for the case of certain new calls eg new Hat<number>;
  */
  constructor(public callable: Expression, public args: Expression[] = [], public typeArguments: Type[] = []) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.args).concat(this.typeArguments).concat([this.callable]);
  }

  buildString(): string {
    var result = this.callable.toString();
    if (this.typeArguments.length > 0) {
      result += "<" + this.typeArguments.map((s) => { return s.toString() }).join(", ") + ">";
    }

    if (this.args != null) {
      result += "(" + this.args.map((a) => { return a.toString() }).join(", ") + ")";
    }
    return result;
  }
}

/** Represents the property entries for ObjectLiterals, eg { a: 1, b: "blue", c } */
export class ObjectLiteralProperty extends CodeNode {
  constructor(public name: Identifier|AtomicValue|ComputedDeclarationName, public initializer?: Expression) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.name, this.initializer]);
  }

  buildString() {
    if (this.initializer != null) {
      return `${this.name.toString() }: ${this.initializer.toString() }`
    } else {
      return this.name.toString();
    }
  }
}

/** ObjectLiterals are composed of either Trivia or these elements. */
export type ObjectLiteralElement = ObjectLiteralProperty|Function;

/** Similar to property access, but for bracket element access, eg myArray[0] */
export class ElementAccess extends CodeNode {
  constructor(public accessed: Expression, public elementIndex: Expression) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.accessed, this.elementIndex]);
  }

  buildString(): string {
    return `${this.accessed.toString() }[${this.elementIndex.toString() }]`;
  }
}

/** Convenience case for the instanceof binary operation. */
export class InstanceOf extends BinaryOperation {
  constructor(left: Expression, right: Expression) {
    super("instanceof", left, right);
  }
}

/** Handling of 'new' prefacing a call. */
export class New extends CodeNode {
  constructor(public constructorCall: Call) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.constructorCall]);
  }

  buildString() {
    return "new " + this.constructorCall.toString();
  }
}

/** Handling of 'delete' prefacing an expression. */
export class Delete extends UnaryOperation {
  constructor(expression: Expression) {
    super("delete ", expression, false);
  }
}

/** Handling of 'typeof', which can appear both as an expression as a type query */
export class TypeOf extends UnaryOperation {
  constructor(expression: Expression) {
    super("typeof ", expression, false);
  }
}

/**
  A block representing an ObjectLiteral, composed generally of Trivia,
  ObjectLiteralProperties and Functions
*/
export class ObjectLiteral extends AbstractExpressionBlock {
  buildString(): string {
    return "{" + super.buildString() + "}";
  }
}

/** Spread operator used on an expression as part of arguments to a function */
export class Spread extends UnaryOperation {
  constructor(expression: Expression) {
    super("...", expression, false);
  }
}

/**
  Used by break and continue.  An unary 'operator' like keyword
*/
export class KeywordOperator extends CodeNode {
  constructor(public keyword: string, public expression?: Expression) {
    super();
  }

  buildString(): string {
    if (this.expression != null)
      return this.keyword + " " + this.expression;
    return this.keyword;
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.expression]);
  }
}

export class Break extends KeywordOperator {
  /**
  param label if provided, expression indicating the label
  the break should send to.  eg, break THISLABEL
  */
  constructor(label?: Expression) {
    super("break", label);
  }
}

export class Continue extends KeywordOperator {
  /**
  param label if provided, expression indicating the label
  the continue should send to.  eg, continue THISLABEL
  */
  constructor(label?: Expression) {
    super("continue", label);
  }
}

export class Void extends KeywordOperator {
  constructor(expression: Expression) {
    super("void", expression);
  }
}

/** A type assertion expression, eg var m = <string>2; */
export class TypeAssertion extends CodeNode {
  constructor(public expression: Expression, public type: Type) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.expression, this.type]);
  }

  buildString(): string {
    return "<" + this.type.toString() + ">" + this.expression.toString();
  }
}

/**
  A label ala the new ES6 async syntax.
*/
export class LabeledStatement extends CodeNode {
  constructor(public label: Identifier, public statement?: CodeNode) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.label, this.statement]);
  }

  buildString(): string {
    return this.label + ": " + (this.statement || "");
  }
}

/** A new ES6 construct that can use an expression as a property declaration name */
export class ComputedDeclarationName extends CodeNode {
  constructor(public computation: Expression) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.computation]);
  }

  buildString(): string {
    return "[" + this.computation.toString() + "]";
  }
}

export type MemberDeclarationName = Identifier|ComputedDeclarationName;
export type DeclarationName = ArrayBinding|ObjectBinding|Identifier|ComputedDeclarationName|AtomicValue;
export type DeclarationBinding = BindingElement|EmptyExpression;
export type ElementDeclarationName = Identifier|ComputedDeclarationName|AtomicValue;
export type BindingPropertyName = Identifier|ArrayBinding|ObjectBinding;

export class ArrayBinding extends CodeNode {
  constructor(public bindings: DeclarationBinding[] = []) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.bindings);
  }

  buildString(): string {
    return "[" + this.bindings.map((s) => s.toString()).join(", ") + "]";
  }
}

/**
  BindingElements are used in object / array deconstruction assignments, and represent
  a single element or property entity being deconstructed.
*/
export class BindingElement extends CodeNode {
  constructor(
    public binding: BindingPropertyName,
    public propertyName?: ElementDeclarationName,
    public isSpread = false,
    public initializer?: Expression) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat([this.binding, this.initializer, this.propertyName]);
  }

  buildString(): string {
    var result = this.propertyName == null ? "" : this.propertyName.toString() + ": ";
    result += this.binding.toString();
    if (this.isSpread) result = "..." + result;
    if (this.initializer) result += "=" + this.initializer.toString();
    return result;
  }
}

/**
  Represents the new ES6 binding syntax for assigning variables via
  deconstructing an object's properties.
*/
export class ObjectBinding extends CodeNode {
  constructor(public bindings: DeclarationBinding[] = []) {
    super();
  }

  buildChildren(): CodeNode[] {
    return super.buildChildren().concat(this.bindings);
  }

  buildString(): string {
    return "{" + this.bindings.map((s) => s.toString()).join(", ") + "}";
  }
}

export enum VariableDeclarationType {
  "LET", "VAR", "CONST"
}

const VARIABLE_DECLARATION_STRING: { [k: number]: string } = {
  [VariableDeclarationType.LET]: "let",
  [VariableDeclarationType.VAR]: "var",
  [VariableDeclarationType.CONST]: "const"
}

/**
  Variable declarations are expression blocks that can contain multiple Property
  and Trivia entries representing each declaration.  ie var a, b, c = 1;
  Convenience method forProperty can produce a variable declaration block for a single
  variable givn by the Property;  This class is used for all of LET, VAR, and CONST
  constructs.
*/
export class VariableDeclaration extends AbstractExpressionBlock {
  constructor(public modifiers: string[] = [], public type = VariableDeclarationType.VAR) {
    super();
  }

  buildString(): string {
    var decBody = super.buildString();
    if (!/\s/.test(decBody[0])) decBody = " " + decBody;
    return this.modifiers.concat([VARIABLE_DECLARATION_STRING[this.type]]).join(" ") + decBody;
  }

  statementLevelTerminal() {
    return ";";
  }

  static forProperty(property: Property, modifiers: string[] = [], type = VariableDeclarationType.VAR) {
    var declaration = new VariableDeclaration(modifiers, type);
    declaration.elements.push(property);
    return declaration;
  }
}

/**
  The If construct -- each of thenCode and elseCode can be CodeBlocks to represent
  { } enclosed multi line work, or a single expression otherwise.
*/
export class If extends CodeNode {
  constructor(public conditional: Expression, public thenCode: CodeNode, public elseCode?: CodeNode) {
    super();
  }

  buildString(): string {
    var result: string = "if (" + this.conditional.toString() + ") " + this.thenCode.toString();
    if (this.elseCode) result += this.thenCode.statementLevelTerminal() + " else " + this.elseCode.toString();
    return result;
  }

  buildChildren() {
    return super.buildChildren().concat([this.conditional, this.thenCode, this.elseCode]);
  }

  statementLevelTerminal() {
    return (this.elseCode || this.thenCode).statementLevelTerminal();
  }
}

/**
  Represent both do and while constructs.
*/
export class Loop extends CodeNode {
  constructor(public conditional: Expression, public iteration: CodeNode, public isDo = false) {
    super();
  }

  buildString() {
    if (this.isDo) {
      return ["do", this.iteration.toString(), "while", "(" + this.conditional.toString() + ")"].join(" ");
    } else {
      return ["while", "(" + this.conditional.toString() + ")", this.iteration.toString()].join(" ");
    }
  }

  buildChildren() {
    return super.buildChildren().concat([this.conditional, this.iteration]);
  }

  statementLevelTerminal() {
    return "";
  }
}

export class Try extends CodeNode {
  constructor(
    public block: CodeBlock, public catchBlock?: CodeBlock, public catchIdentifier?: Identifier,
    public finallyBlock?: CodeBlock
    ) {
    super();
  }

  buildString() {
    var result = "try " + this.block.toString();
    if (this.catchBlock != null) {
      result += " catch(" + this.catchIdentifier.toString() + ") " + this.catchBlock.toString();
    }
    if (this.finallyBlock != null) result += " finally " + this.finallyBlock.toString();
    return result;
  }

  buildChildren() {
    return super.buildChildren().concat([this.block, this.catchBlock, this.finallyBlock, this.catchIdentifier]);
  }

  statementLevelTerminal() {
    return "";
  }
}

export class ForInOf extends CodeNode {
  constructor(
    public initializer: VariableDeclaration|Expression,
    public container: Expression,
    public body: CodeNode,
    public isOf = false) {
    super();
  }

  buildString() {
    return "for (" + this.initializer.toString() + " " + this.containerRelation() + " " + this.container.toString()
      + ") " + this.body.toString();
  }

  containerRelation() {
    return this.isOf ? "of" : "in";
  }

  buildChildren() {
    return super.buildChildren().concat([this.initializer, this.container, this.body]);
  }

  statementLevelTerminal() {
    return (this.body instanceof CodeBlock) ? "" : ";";
  }
}

export class For extends CodeNode {
  constructor(
    public initializer?: VariableDeclaration|Expression,
    public condition?: Expression,
    public iteration?: Expression,
    public body?: CodeNode) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.initializer, this.condition, this.iteration, this.body]);
  }

  buildString() {
    return "for (" + (this.initializer || "") + "; " + (this.condition || "")
      + "; " + (this.iteration || "") + ") " + (this.body || "");
  }

  statementLevelTerminal() {
    return "";
  }
}

export class With extends CodeNode {
  constructor(public expression: Expression, public body: CodeNode) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.expression, this.body]);
  }

  buildString() {
    return "with (" + this.expression.toString() + ") " + this.body.toString();
  }

  statementLevelTerminal() {
    return "";
  }
}

export class Case extends AbstractStatementBlock {
  constructor(public expression?: Expression) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.expression]);
  }

  buildString() {
    var result: string;
    if (this.expression) {
      result = "case " + this.expression.toString() + ":";
    } else {
      result = "default:";
    }
    return result + super.buildString();
  }
}

/**
  Switches are composed generally of Trivia and Case statements.
*/
export class Switch extends CodeBlock {
  constructor(public expression: Expression) {
    super();
  }

  buildChildren() {
    return super.buildChildren().concat([this.expression]);
  }

  buildString() {
    return "switch (" + this.expression.toString() + ") " + super.buildString();
  }
}
