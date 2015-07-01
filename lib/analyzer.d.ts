import * as ts from "typescript";
import statements = require("./statements");
/**
When true, tscripter will throw an exception anytime it encounters an AST segment
it does not understand, but when false failing segments will be wrapped in a CodeNode as a
fallback, and an error will be logged.
*/
export declare var strictMode: boolean;
/**
  The main entry point of tscripter, setups a program from which to analyze files.
*/
export declare class AnalyzerHost {
  nodeRegistery: {
    [id: number]: statements.CodeNode;
  };
  sources: {
    [k: string]: statements.Source;
  };
  program: ts.Program;
  typechecker: ts.TypeChecker;
  /**
  param entryPoints either a string array pointing to files to begin analyzing, or an
  existing ts.Program.
  param compilerOptions ignored when entryPoints is an existing ts.Program.  Used when
  instantiating a new ts.Program from the given entryPoints.
  */
  constructor(entryPoints: string[]| ts.Program, compilerOptions?: ts.CompilerOptions);
  /**
  returns a statements.Source for all entry points for the current host
  param recursive passed in to the .analyze call for each source.
  */
  analyzeAll(recursive?: boolean): statements.Source[];
  /**
  param source either the filepath or source instance matching a source file to analyze.
  param recursive passed through to getAnalyzer.
  returns a statement.Source object for the given file, or null if such a file could
  not be found by the host's ts.Program.
  */
  analyze(source: string | statements.Source, recursive?: boolean): statements.Source;
  /**
  param source non null representing the source filepath our statements.Source to analyze.
  param recursive passed through to the constructor of SourceAnalyzer.
  returns a new SourceAnalyzer matching the given source.
  */
  getAnalyzer(source: string | statements.Source, recursive?: boolean): SourceAnalyzer;
  /**
    returns the corresponding statements.Source after normalizing the input
    sourcePath.
  */
  getSource(sourcePath: string | statements.Source): statements.Source;
}
/**
  An object that represents the configuration of a source file's analyzation
  work.  No state is kept on the analyzer itself, so multiple of these can
  be constructed for the same configuration.
*/
export declare class SourceAnalyzer {
  private host;
  private source;
  private sourceFile;
  private recursive;
  /**
  param recursive When true, all analyzer functions will recursively analyze any other block
  found within.  When false, only the most shallow level of statements will be analyzed, and the
  caller must manually analyze for any other depth.
  */
  constructor(host: AnalyzerHost, source: statements.Source, sourceFile: ts.SourceFile, recursive: boolean);
  /**
  Analyzes the top level source statements and fills the statements.  Source elements array
  with new CodeNodes corresponding to the analyzed AST.  Please see the recursive constructor
  parameter.

  analyze and analyzeBody both will not re-analyze the same block twice
  upon multiple invocations without a call to the block's own resetBody().
  This makes these calls idempotent and safe to call multiple times without
  mutating existing state.
  */
  analyze(): statements.Source;
  /**
  Analyzes the given AbstractBlock, as if it belonged to the same source file
  as this analyzer, and fills its elements array out with new CodeNodes
  corresponding to the analyzed AST.  Please see the recursive constructor
  parameter.

  analyze and analyzeBody both will not re-analyze the same block twice
  upon multiple invocations without a call to the block's own resetBody().
  This makes these calls idempotent and safe to call multiple times without
  mutating existing state.
  */
  analyzeBody(block: statements.AbstractBlock): statements.AbstractBlock;
  private performBlockAnalysis<NodeType, BlockType>(block, elements, elementAnalyzer, ignoreTrailing?);
  private addToBlock<T>(statement, block, element);
  private analyzeCodeBlock(block);
  private analyzeModuleBody(module);
  private analyzeModuleQualifiedName(moduleDeclaration);
  private analyzeModuleDeclaration(moduleDeclaration);
  private analyzeModuleElement(moduleElement);
  private getTemplateLiteralPiece(le);
  private analyzeElementDeclarationName(elementDeclarationName);
  private analyzeObjectLiteralElement(element);
  private analyzeObjectLiteralBody(objectLiteral);
  private analyzeObjectLiteral(objectLiteral);
  private analyzeArrayLiteralBody(arrayLiteral);
  private analyzeArrayLiteral(arrayLiteral);
  private tryAnalyzeAtomicValue(node);
  private analyzeExpression(expr);
  private analyzeCallExpression(callExpr);
  private analyzeEnumBody(enumeration);
  private analyzeEnumElement(m);
  private analyzeEnumDeclaration(enumDeclaration);
  private analyzeTypeAliasDeclaration(alias);
  private analyzeInterfaceDeclaration(interfaceDeclaration);
  private analyzeInterfaceBody(intface);
  private analyzeTypeLiteralBody(typeLiteral);
  private analyzeTypeLiteral(typeLiteral);
  private addSpacingAndGetExpressionText(node, block);
  private analyzeRequireImport(importStatement, moduleReference);
  private analyzeInternalModuleImport(importStatement, moduleReference);
  private analyzeEntityNameType(qualifiedName);
  private analyzeQualifiedNameLikeExpression(expression);
  private analyzeCallable(signature, isPropertyType, keywordName?);
  private analyzeCallableType(signature, keywordName?);
  private analyzeCallableSignature(signature, keywordName?);
  private analyzeTypes(types);
  private analyzeTypeParameters(typeParameterDeclarations);
  private analyzeModifiers(nodeWithModifiers);
  private analyzeClassDeclaration(classDeclaration);
  private analyzeClassBody(klass);
  private addTrailingBlockSpacing(block, blockNode);
  private analyzeLambda(arrFunction);
  private analyzeLambdaBody(lambda);
  private analyzeFunction(functionDeclaration, isMethod?, keywordName?);
  private analyzeFunctionBody(func);
  analyzeVariableDeclaration(variables: statements.VariableDeclaration): statements.VariableDeclaration;
  private analyzeVariableStatement(variableStatement);
  private analyzeBlockStatement(statement);
  private analyzeForInitializer(forStmt);
  private analyzeCaseBody(caseStatement);
  private analyzeSwitchBody(switchStatement);
  private analyzeCase(caseStmt);
  private analyzeSwitchStatement(switchStmt);
  private analyzeStatement(statement);
  private analyzeAccessor(accessorDeclaration, isGet);
  private analyzeClassElement(element);
  private getModifiers(hasModifiers);
  private analyzeBindingElement(bindingElement);
  private analyzeBindingPattern(pattern);
  private analyzeDeclarationName(declarationName);
  private analyzeProperty(property);
  private analyzeHeritageClause(type);
  private getStringText(expr);
  private analyzeIdentifier(expr);
  private getIdentifierName(expr);
  private analyzeNamedImportOrExports(importsOrExports);
  private analyzeImportDeclaration(importDeclaration);
  private failAnalysis(node, type);
}
