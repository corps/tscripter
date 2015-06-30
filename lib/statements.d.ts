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
    constructorName: string;
    /** Contains JSON serializable attributes of a CodeNode */
    data: {
        [k: string]: any;
    };
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
export declare class CodeNode {
    node: ts.Node;
    /**
      The last canonical 'rendering' of the node.  When a node is analyzed from
      existing code it will represent exactly what was in the source.
      For new nodes, or dirtied nodes, calling toString() will set this based
      on tscripter's owner rendering via buildString().
    */
    text: string;
    constructor(node?: ts.Node);
    /** convenience method for setting the 'rendering' of a node, used by the analyzer */
    setText(text: string): CodeNode;
    /** convenience method for setting the ts.Node from which the analyzer constructed the node. */
    registerWithNode(node: ts.Node): CodeNode;
    /**
    @returns a rendering of the node and it's attributes into a CodeNodeJSON shaped object.
    All attributes of a code node, save the following metadata, are serialized out to the
    resulting data: node, bodyHasBeenAnalyzed, text, any starting with _
    Any attributes that are themselves CodeNode's will be serialized according to the
    CodeNodeJSON interface.
    */
    toJSON(): CodeNodeJSON;
    /** @returns all non null children by filtering buildChildren() */
    getChildren(): CodeNode[];
    /** @returns an array containing all immediate children, including nulls for empty children. */
    buildChildren(): CodeNode[];
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
    markDirty(recursive?: boolean): CodeNode;
    /**
    @returns the current cached rendering of the CodeNode.  When text is non null,
    it will simply return that.  Otherwise, it will call buildString() and cache that value
    into text before returning it.
    */
    toString(): string;
    /**
    @returns the tscripter rendering of the current node.  Note that child nodes
    are themselves rendered via toString() and thus will use their last cached rendering.
    Use markDirty to reset children if necessary before calling.
    */
    buildString(): string;
    /**
    Recursively walks this node's children breadth first searching for a node for which
    predicateF returns true.
  
    @param predicateF given each CodeNode traversed and determines when the search should complete.
    @param includeSelf iff true, this node will also be traversed.
    @returns the first CodeNode, or null, that meets the condition given by predicateF.
    */
    findChild(predicateF: (s: CodeNode) => boolean, includeSelf?: boolean): CodeNode;
    /**
      Exactly the same as findChild, only that it always walks every child calling
      the given walker for each CodeNode.
      @param walker called with each CodeNode encountered.
    */
    walkChildren(walker: (s: CodeNode) => void, includeSelf?: boolean): void;
    /**
      Most nodes typically use the ; to indicate statement termination, but
      some special cases (specifically code blocks themselves) do not.
  
      @returns the string to be appended to the end of this CodeNode when it
      appears as a block level statement.
    */
    statementLevelTerminal(): string;
}
/**
  Represents a "block" of CodeNodes.
  Subclasses of AbstractBlock will not have the elements of their body analyzed
  by default unless true is provided for the analyzer's recursive argument.  Instead,
  one should call the analyzeBody method with the abstract block in question
  to fill its elements out.
*/
export declare class AbstractBlock extends CodeNode {
    /** used to indicate wether typescript has yet to analyze the contents of the block's ts.Node. */
    bodyHasBeenAnalyzed: boolean;
    /** the statement, expression, or declaration CodeNodes that belong to the block */
    elements: CodeNode[];
    buildString(): string;
    buildChildren(): CodeNode[];
    statementLevelTerminal(): string;
    /**
      Used by the analyzer to decide wether a block has been analyzed.  when this returns false,
      analyzing the body of a block will result in a no-op.
    */
    canAnalyzeBody(): boolean;
    /** clears the body of the block and resets its bodyHasBeenAnalyzed state to false */
    resetBody(): void;
}
/**
  A type of Block whose elements are Statements, and thus should be terminated by
  their corresponding statementLevelTerminal().
*/
export declare class AbstractStatementBlock extends AbstractBlock {
    buildString(): string;
}
/**
  The most common type of StatementBlock that begins and ends with { }
*/
export declare class CodeBlock extends AbstractStatementBlock {
    buildString(): string;
}
/**
  Expression Blocks differ in that their elements are separated by commas, and not
  terminated via the statementLevelTerminal.
*/
export declare class AbstractExpressionBlock extends AbstractBlock {
    buildString(): string;
}
export declare class SimpleNode extends CodeNode {
    token: string;
    constructor(token: string);
    buildString(): string;
}
/** Keywords are reserved tokens that are not expressions or types */
export declare class Keyword extends SimpleNode {
}
/** An odd mapping for "empty" statements / expressions that contain nothing but a potential terminal */
export declare class EmptyExpression extends SimpleNode {
    constructor();
}
/**
  The top level node of a source file, containing all the statements of that
  file.
*/
export declare class Source extends AbstractStatementBlock {
    fileName: string;
    constructor(fileName: string);
    /** convenience accessor for the corresponding ts.SourceFile */
    sourceNode: ts.SourceFile;
    /** returns a version of the Block's buildString() that always includes a trailing new line. */
    buildString(): string;
}
export declare type ModuleDeclarationName = QualifiedName | AtomicValue;
/**
  Represents module MyModule {} or module "happy" {} blocks, based on the type of the name.
*/
export declare class Module extends CodeBlock {
    name: ModuleDeclarationName;
    modifiers: string[];
    constructor(name: ModuleDeclarationName, modifiers?: string[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents 'internal' module imports, ala
  import MyHat = Body.Head.Hat;
*/
export declare class InternalModuleImport extends CodeNode {
    symbolName: string;
    moduleName: QualifiedName;
    modifiers: string[];
    constructor(symbolName: string, moduleName: QualifiedName, modifiers?: string[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents 'External' Module imports via CommonJS require.
  import fs = require("fs")
*/
export declare class RequireImport extends CodeNode {
    importedAs: Identifier;
    importPath: Expression;
    modifiers: string[];
    constructor(importedAs: Identifier, importPath: Expression, modifiers?: string[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  A dot separated qualification of names used for types and modules, never expressions.
*/
export declare class QualifiedName extends CodeNode {
    name: string;
    qualification: QualifiedName;
    /**
    @param name the farthest right name of this type.
    @param qualification the QualifiedName that precedes the name and is separated via a dot.
    */
    constructor(name: string, qualification?: QualifiedName);
    buildString(): string;
    buildChildren(): CodeNode[];
    /**
    returns an equivalent CodeNode representing an expression form of this name.
    The text and node is preserved.
    */
    asExpression(): Expression;
    /** returns the QualifiedTypeName of this QualifiedName with not type parameters. */
    asTypeName(): QualifiedTypeName;
}
/** One of the three built in keyword types, boolean, string, or number. */
export declare class KeywordType extends SimpleNode {
    static boolean: KeywordType;
    static string: KeywordType;
    static number: KeywordType;
}
/** A wrapping of a QualifiedName that may include type parameters.  */
export declare class QualifiedTypeName extends CodeNode {
    name: QualifiedName;
    typeParameters: Type[];
    constructor(name: QualifiedName, typeParameters?: Type[]);
    buildChildren(): CodeNode[];
    buildString(): string;
    /** returns an equivalent New expression invoking the name and typeParameters, using the given args */
    asNew(args?: Expression[]): New;
    /** Convenience for QualifiedTypeNames without qualifications or typeParameters */
    static fromSimpleName(name: string): QualifiedTypeName;
}
/** A type given by an array of it's elementType eg string[] */
export declare class ArrayType extends CodeNode {
    elementType: Type;
    constructor(elementType: Type);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** Represents unions of types separated via | */
export declare class UnionType extends CodeNode {
    names: Type[];
    constructor(names: Type[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/** A peculiar type expression clarification used in Array or Union types eg (string | number)[] */
export declare class ParenthesizedType extends CodeNode {
    type: Type;
    constructor(type: Type);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** a union type containing all valid 'Type' CodeNodes */
export declare type Type = ParenthesizedType | QualifiedTypeName | UnionType | CallableType | TypeLiteral | ArrayType | KeywordType | TupleType | TypeOf;
/** Represents a tuple type eg [string, number] */
export declare class TupleType extends CodeNode {
    types: Type[];
    constructor(types?: Type[]);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** an expression that alias's a type eg type Me = You */
export declare class TypeAlias extends CodeNode {
    name: string;
    type: Type;
    modifiers: string[];
    constructor(name: string, type: Type, modifiers?: string[]);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** A declaration used to define an enum value, the most common children of Enumeration blocks. */
export declare class EnumEntry extends CodeNode {
    name: ElementDeclarationName;
    initializer: Expression;
    constructor(name: ElementDeclarationName, initializer?: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** A block mostly composed of EnumEntries, eg enum { RED = 1 }*/
export declare class Enumeration extends AbstractExpressionBlock {
    name: string;
    modifiers: string[];
    constructor(name: string, modifiers?: string[]);
    buildString(): string;
}
/** A single type parameter representing its name and extends constraint */
export declare class TypeParameter extends CodeNode {
    name: string;
    typeConstraint: Type;
    constructor(name: string, typeConstraint?: Type);
    toString(): string;
    buildChildren(): CodeNode[];
}
/**
  A type representing an anonymous interface eg { a: number, b: string }
  Elements are generally Spacing or PropertyIndexOrCallables.
*/
export declare class TypeLiteral extends CodeBlock {
}
/** A block describing an interface, whose children are generally Properties */
export declare class Interface extends CodeBlock {
    name: string;
    typeParameters: TypeParameter[];
    extendedInterfaces: QualifiedTypeName[];
    modifiers: string[];
    constructor(name: string, typeParameters?: TypeParameter[], extendedInterfaces?: QualifiedTypeName[], modifiers?: string[]);
    buildString(): string;
    buildChildren(): CodeNode[];
    private buildDeclarationHead();
}
export declare class AbstractCallableSignature extends CodeNode {
    name: DeclarationName;
    args: Property[];
    returnType: Type;
    typeParameters: TypeParameter[];
    isOptional: boolean;
    /**
    @param name the declaration name for the signature, or anonymous when null.
    @param isOptional when true, the signature is rendered with a ? as for optional
    interface elements.
    */
    constructor(name?: DeclarationName, args?: Property[], returnType?: Type, typeParameters?: TypeParameter[], isOptional?: boolean);
    buildChildren(): CodeNode[];
    buildString(): string;
    private returnTypeSeparator();
    protected isPropertyType(): boolean;
}
/**
  A type of CallableSignature used to explain a callable expression, such as a lambda, or method
  eg: var f = (a: number): string => { return ""; }  , myMethod(): number { return 3; }

  The difference between a CallableSignature and a CallableType is wether the return value
  can be expressed using an => or a :.
  */
export declare class CallableSignature extends AbstractCallableSignature {
    _callableSignature: boolean;
    protected isPropertyType(): boolean;
}
/**
  A type of CallableSignature used to explain a callable property type.
  eg: { myMethod: () => string }

  The difference between a CallableSignature and a CallableType is wether the return value
  can be expressed using an => or a :.
  */
export declare class CallableType extends AbstractCallableSignature {
    _callableType: boolean;
    protected isPropertyType(): boolean;
}
export declare type Callable = CallableSignature | CallableType;
/**
  Describes a function that uses traditional function () {} syntax without the => binding
  semantics. Its elements are considered to be statements and are terminated via ;
*/
export declare class Function extends CodeBlock {
    callableSignature: CallableSignature;
    modifiers: string[];
    isMethod: boolean;
    declaredOnly: boolean;
    decorators: Expression[];
    /**
    @param name the name of the function, can be null to represent anonymous functions.
    @param callableSignature the signature of the function
    @param modifiers the string modifiers preceeding the function, such as export, private, etc
    @param isMethod when true AND name is null, the token 'function' is not rendered.
    @param declaredOnly when true, the body {} is not rendered and the statement is terminated via ;
    Used for ambient function declarations;
     */
    constructor(callableSignature: CallableSignature, modifiers?: string[], isMethod?: boolean, declaredOnly?: boolean, decorators?: Expression[]);
    buildChildren(): CodeNode[];
    buildString(): string;
    private buildDeclarationHead();
    statementLevelTerminal(): string;
}
/**
  Similar to the Function, but uses => lambda semantics.
*/
export declare class Lambda extends CodeBlock {
    callableSignature: CallableSignature;
    isSingleExpression: boolean;
    withoutParanthesis: boolean;
    /**
    @param isSingleExpression when true, the lambda is rendered without containing block brackets {}.
    Only valid for blocks that contain one statement and spacing that contains no new lines.
    param withoutParanthesis when this is true, the rendered lambda excludes paranthesis around
    its signature.
    @param withoutParanthesis when true, the parameters of the signature are rendered without
    parenthesis.
    */
    constructor(callableSignature: CallableSignature, isSingleExpression?: boolean, withoutParanthesis?: boolean);
    buildChildren(): CodeNode[];
    buildString(): string;
    statementLevelTerminal(): string;
}
/**
  A property represents a declaration of a variable or member within a container.
  Properties are used to declare arguments of functions and members of classes.
  In ambient declarations, the 'type' of a property can also be an AtomicValue.
*/
export declare class Property extends CodeNode {
    name: DeclarationName;
    type: PropertyTypeQuery;
    initializer: CodeNode;
    modifiers: string[];
    decorators: Expression[];
    optional: boolean;
    dotDotDot: boolean;
    constructor(name: DeclarationName, type?: PropertyTypeQuery, initializer?: CodeNode, modifiers?: string[], decorators?: Expression[], optional?: boolean, dotDotDot?: boolean);
    buildChildren(): CodeNode[];
    buildString(): string;
}
export declare type PropertyTypeQuery = Type | AtomicValue;
/**
  Represents an assignment to the export keyword.
*/
export declare class ExportAssignment extends CodeNode {
    expression: Expression;
    isDefault: boolean;
    constructor(expression: Expression, isDefault?: boolean);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  Represents the indexing type of an interface or type literal.
  eg interface MyDict { [k:string]: number }
*/
export declare class Index extends CodeNode {
    keyName: string;
    keyType: Type;
    valueType: Type;
    constructor(keyName: string, keyType: Type, valueType: Type);
    buildChildren(): CodeNode[];
    buildString(): string;
}
export declare type PropertyIndexOrCallable = Property | Index | CallableSignature;
/** A class block, generally containing declarations, properties, and functions */
export declare class Class extends CodeBlock {
    name: string;
    modifiers: string[];
    parentClass: QualifiedTypeName;
    typeParameters: TypeParameter[];
    implementedInterfaces: QualifiedTypeName[];
    decorators: Expression[];
    constructor(name: string, modifiers?: string[], parentClass?: QualifiedTypeName, typeParameters?: TypeParameter[], implementedInterfaces?: QualifiedTypeName[], decorators?: Expression[]);
    buildChildren(): CodeNode[];
    buildString(): string;
    classNode: ts.ClassElement;
    private buildDeclarationHead();
}
/**
  Spacing represents any whitespace trivia included before or after other CodeNode's
  in blocks. They are preserved as separate nodes so as to make transformation while
  retaining code style more plausible.
*/
export declare class Spacing extends SimpleNode {
    statementLevelTerminal(): string;
}
/**
  Represents a set of names being imported or export from an ES6 module,
  where each part can be either
  * a single element array mapping an Identifier "as is", eg B
  * a two element array mapping an Identifier to a naming one identifier as another, eg A as B
*/
export declare class NamedImportOrExports extends CodeNode {
    parts: ([Identifier]|[Identifier, Identifier])[];
    /**
    @param parts each element should be either a single Identifier being imported / exported
    under the same name as it was defined, or a pair of Identifiers mapping the definition
    Identifier 'as' another Identifier.
    */
    constructor(parts?: ([Identifier]|[Identifier, Identifier])[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents a module being bound "ES6" style via the wildcard token, eg * as MyModule
*/
export declare class NamespaceBinding extends CodeNode {
    name: Identifier;
    constructor(name: Identifier);
    buildString(): string;
    buildChildren(): CodeNode[];
}
export declare type ImportExportsBinding = NamespaceBinding | NamedImportOrExports;
/** Represents ES6 style external module imports in the form of import yDefault, * as X from Y */
export declare class ES6Import extends CodeNode {
    importPath: Expression;
    defaultImportedAs: Identifier;
    namespaceBinding: ImportExportsBinding;
    modifiers: string[];
    constructor(importPath: Expression, defaultImportedAs?: Identifier, namespaceBinding?: ImportExportsBinding, modifiers?: string[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents the ES6 export declaration, eg
  export { A, B as C } from "./module"
*/
export declare class ExportDeclaration extends CodeNode {
    bindings: ImportExportsBinding;
    importPath: Expression;
    constructor(bindings?: ImportExportsBinding, importPath?: Expression);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents the simple ES6 import with no bindings, eg
  import "./this-module";
*/
export declare class SimpleImport extends CodeNode {
    importPath: Expression;
    constructor(importPath: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
export declare type Import = SimpleImport | ES6Import;
export declare type Expression = TypeAssertion | New | ElementAccess | ObjectLiteral | RegexLiteral | ArrayLiteral | TemplatePattern | AtomicValue | Identifier | UnaryOperation | BinaryOperation | Parenthetical | TernaryOperation | PropertyAccess | Call | TaggedTemplate | EmptyExpression;
/**
  Represents an 'atomic' literal, a value which cannot be decomposed further, such
  as strings, numbers, booleans, or null / undefined.
*/
export declare class AtomicValue extends SimpleNode {
    _isLiteral: boolean;
    constructor(token: string);
    setValue(contents: string | number | boolean): void;
    getValue(): string | number | boolean;
    static fromToken(token: string): string | number | boolean;
    static toToken(thing: string | number | boolean): string;
}
/**
  A regular expression literal.  Convenience method fromRegex can build this correctly
  from a given literal of your own.
*/
export declare class RegexLiteral extends CodeNode {
    body: string;
    flags: string[];
    constructor(body: string, flags: string[]);
    static fromRegex(regex: RegExp): RegexLiteral;
    asRegex(): RegExp;
    buildString(): string;
}
export declare class ArrayLiteral extends AbstractExpressionBlock {
    buildString(): string;
}
/**
  Represents a variable identifier name.
*/
export declare class Identifier extends SimpleNode {
    _isIdentifier: boolean;
}
/**
  Represents a parenthesis around an expression.
*/
export declare class Parenthetical extends CodeNode {
    expression: Expression;
    constructor(expression: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  Represents a text literal composing a template.
  Templates consist of variable interpolation and literal pieces
  interweaved.
*/
export declare class TemplateLiteralPiece extends CodeNode {
    value: string;
    constructor(value: string);
    static asToken(value: string): string;
    static asText(value: string): string;
    buildString(): string;
    static fromToken(token: string): TemplateLiteralPiece;
}
/**
  A union type of possible pieces to a template, including the
  literal template strings and the expressions captured for
  interpolation.
*/
export declare type TemplatePart = TemplateLiteralPiece | Expression;
/**
  See TemplateLiteralPiece and TemplatePart.  These compose typescript
  string templates, eg `hi ${name}`
*/
export declare class TemplatePattern extends CodeNode {
    parts: TemplatePart[];
    constructor(parts?: TemplatePart[]);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents the ES6 tagged template construct, in which a function identifier
  is placed before a template pattern, eg i18n `hello world!`
*/
export declare class TaggedTemplate extends CodeNode {
    tagF: Expression;
    template: TemplatePattern;
    constructor(tagF: Expression, template: TemplatePattern);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/**
  Represents single parameter operations such as !.
*/
export declare class UnaryOperation extends CodeNode {
    operator: string;
    expression: Expression;
    postfix: boolean;
    /**
    param postfix when true, the operator comes at the end of the expression, otherwise the beginning.
    */
    constructor(operator: string, expression: Expression, postfix: boolean);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  Convenience case of UnaryOperation representing a return.
*/
export declare class Return extends UnaryOperation {
    /**
    param expression when given, provides the value for the return.
    */
    constructor(expression?: Expression);
}
/**
  Convenience case of UnaryOperation representing a throw.
*/
export declare class Throw extends UnaryOperation {
    constructor(expression: Expression);
}
/**
  Represents an operation taking a left and right expressions separated by an operator.
*/
export declare class BinaryOperation extends CodeNode {
    operator: string;
    left: Expression;
    right: Expression;
    constructor(operator: string, left: Expression, right: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** Represents an attribute access of a left side expression, eg myCall().a */
export declare class PropertyAccess extends CodeNode {
    expression: Expression;
    property: string;
    constructor(expression: Expression, property: string);
    buildString(): string;
    buildChildren(): CodeNode[];
}
/** Represents a ternary operation, taking two operator and three expressions. */
export declare class TernaryOperation extends CodeNode {
    operators: [string, string];
    expressions: [Expression, Expression, Expression];
    constructor(operators: [string, string], expressions: [Expression, Expression, Expression]);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
Represents the invocation of an expression with the given args and type arguments.
*/
export declare class Call extends CodeNode {
    callable: Expression;
    args: Expression[];
    typeArguments: Type[];
    /**
    param args when null, the parenthesis will not be present in the invocation, as
    for the case of certain new calls eg new Hat<number>;
    */
    constructor(callable: Expression, args?: Expression[], typeArguments?: Type[]);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** Represents the property entries for ObjectLiterals, eg { a: 1, b: "blue", c } */
export declare class ObjectLiteralProperty extends CodeNode {
    name: Identifier | AtomicValue | ComputedDeclarationName;
    initializer: Expression;
    constructor(name: Identifier | AtomicValue | ComputedDeclarationName, initializer?: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** ObjectLiterals are composed of either Spacing or these elements. */
export declare type ObjectLiteralElement = ObjectLiteralProperty | Function;
/** Similar to property access, but for bracket element access, eg myArray[0] */
export declare class ElementAccess extends CodeNode {
    accessed: Expression;
    elementIndex: Expression;
    constructor(accessed: Expression, elementIndex: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** Convenience case for the instanceof binary operation. */
export declare class InstanceOf extends BinaryOperation {
    constructor(left: Expression, right: Expression);
}
/** Handling of 'new' prefacing a call. */
export declare class New extends CodeNode {
    constructorCall: Call;
    constructor(constructorCall: Call);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** Handling of 'delete' prefacing an expression. */
export declare class Delete extends UnaryOperation {
    constructor(expression: Expression);
}
/** Handling of 'typeof', which can appear both as an expression as a type query */
export declare class TypeOf extends UnaryOperation {
    constructor(expression: Expression);
}
/**
  A block representing an ObjectLiteral, composed generally of Spacing,
  ObjectLiteralProperties and Functions
*/
export declare class ObjectLiteral extends AbstractExpressionBlock {
    buildString(): string;
}
/** Spread operator used on an expression as part of arguments to a function */
export declare class Spread extends UnaryOperation {
    constructor(expression: Expression);
}
/**
  Used by break and continue.  An unary 'operator' like keyword
*/
export declare class KeywordOperator extends CodeNode {
    keyword: string;
    expression: Expression;
    constructor(keyword: string, expression?: Expression);
    buildString(): string;
    buildChildren(): CodeNode[];
}
export declare class Break extends KeywordOperator {
    /**
    param label if provided, expression indicating the label
    the break should send to.  eg, break THISLABEL
    */
    constructor(label?: Expression);
}
export declare class Continue extends KeywordOperator {
    /**
    param label if provided, expression indicating the label
    the continue should send to.  eg, continue THISLABEL
    */
    constructor(label?: Expression);
}
export declare class Void extends KeywordOperator {
    constructor(expression: Expression);
}
/** A type assertion expression, eg var m = <string>2; */
export declare class TypeAssertion extends CodeNode {
    expression: Expression;
    type: Type;
    constructor(expression: Expression, type: Type);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  A label ala the new ES6 async syntax.
*/
export declare class LabeledStatement extends CodeNode {
    label: Identifier;
    statement: CodeNode;
    constructor(label: Identifier, statement?: CodeNode);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/** A new ES6 construct that can use an expression as a property declaration name */
export declare class ComputedDeclarationName extends CodeNode {
    computation: Expression;
    constructor(computation: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
export declare type MemberDeclarationName = Identifier | ComputedDeclarationName;
export declare type DeclarationName = ArrayBinding | ObjectBinding | Identifier | ComputedDeclarationName | AtomicValue;
export declare type DeclarationBinding = BindingElement | EmptyExpression;
export declare type ElementDeclarationName = Identifier | ComputedDeclarationName | AtomicValue;
export declare type BindingPropertyName = Identifier | ArrayBinding | ObjectBinding;
export declare class ArrayBinding extends CodeNode {
    bindings: DeclarationBinding[];
    constructor(bindings?: DeclarationBinding[]);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  BindingElements are used in object / array deconstruction assignments, and represent
  a single element or property entity being deconstructed.
*/
export declare class BindingElement extends CodeNode {
    binding: BindingPropertyName;
    propertyName: Identifier;
    isSpread: boolean;
    initializer: Expression;
    constructor(binding: BindingPropertyName, propertyName?: Identifier, isSpread?: boolean, initializer?: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  Represents the new ES6 binding syntax for assigning variables via
  deconstructing an object's properties.
*/
export declare class ObjectBinding extends CodeNode {
    bindings: DeclarationBinding[];
    constructor(bindings?: DeclarationBinding[]);
    buildChildren(): CodeNode[];
    buildString(): string;
}
export declare enum VariableDeclarationType {
    "LET" = 0,
    "VAR" = 1,
    "CONST" = 2,
}
/**
  Variable declarations are expression blocks that can contain multiple Property
  and Spacing entries representing each declaration.  ie var a, b, c = 1;
  Convenience method forProperty can produce a variable declaration block for a single
  variable givn by the Property;  This class is used for all of LET, VAR, and CONST
  constructs.
*/
export declare class VariableDeclaration extends AbstractExpressionBlock {
    modifiers: string[];
    type: VariableDeclarationType;
    constructor(modifiers?: string[], type?: VariableDeclarationType);
    buildString(): string;
    statementLevelTerminal(): string;
    static forProperty(property: Property, modifiers?: string[], type?: VariableDeclarationType): VariableDeclaration;
}
/**
  The If construct -- each of thenCode and elseCode can be CodeBlocks to represent
  { } enclosed multi line work, or a single expression otherwise.
*/
export declare class If extends CodeNode {
    conditional: Expression;
    thenCode: CodeNode;
    elseCode: CodeNode;
    constructor(conditional: Expression, thenCode: CodeNode, elseCode?: CodeNode);
    buildString(): string;
    buildChildren(): CodeNode[];
    statementLevelTerminal(): string;
}
/**
  Represent both do and while constructs.
*/
export declare class Loop extends CodeNode {
    conditional: Expression;
    iteration: CodeNode;
    isDo: boolean;
    constructor(conditional: Expression, iteration: CodeNode, isDo?: boolean);
    buildString(): string;
    buildChildren(): CodeNode[];
    statementLevelTerminal(): string;
}
export declare class Try extends CodeNode {
    block: CodeBlock;
    catchBlock: CodeBlock;
    catchIdentifier: Identifier;
    finallyBlock: CodeBlock;
    constructor(block: CodeBlock, catchBlock?: CodeBlock, catchIdentifier?: Identifier, finallyBlock?: CodeBlock);
    buildString(): string;
    buildChildren(): CodeNode[];
    statementLevelTerminal(): string;
}
export declare class ForInOf extends CodeNode {
    initializer: VariableDeclaration | Expression;
    container: Expression;
    body: CodeNode;
    isOf: boolean;
    constructor(initializer: VariableDeclaration | Expression, container: Expression, body: CodeNode, isOf?: boolean);
    buildString(): string;
    containerRelation(): string;
    buildChildren(): CodeNode[];
    statementLevelTerminal(): string;
}
export declare class For extends CodeNode {
    initializer: VariableDeclaration | Expression;
    condition: Expression;
    iteration: Expression;
    body: CodeNode;
    constructor(initializer?: VariableDeclaration | Expression, condition?: Expression, iteration?: Expression, body?: CodeNode);
    buildChildren(): CodeNode[];
    buildString(): string;
    statementLevelTerminal(): string;
}
export declare class With extends CodeNode {
    expression: Expression;
    body: CodeNode;
    constructor(expression: Expression, body: CodeNode);
    buildChildren(): CodeNode[];
    buildString(): string;
    statementLevelTerminal(): string;
}
export declare class Case extends AbstractStatementBlock {
    expression: Expression;
    constructor(expression?: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
/**
  Switches are composed generally of Spacing and Case statements.
*/
export declare class Switch extends CodeBlock {
    expression: Expression;
    constructor(expression: Expression);
    buildChildren(): CodeNode[];
    buildString(): string;
}
