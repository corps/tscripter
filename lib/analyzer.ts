import * as ts from "typescript";
import path = require("path");
import fs = require("fs");

import statements = require("./statements");

/**
When true, tscripter will throw an exception anytime it encounters an AST segment
it does not understand, but when false failing segments will be wrapped in a CodeNode as a
fallback, and an error will be logged.
*/
export var strictMode = false;

/**
  The main entry point of tscripter, setups a program from which to analyze files.
*/
export class AnalyzerHost {
  nodeRegistery: { [id: number]: statements.CodeNode } = {};
  sources: { [k: string]: statements.Source } = {};
  program: ts.Program;
  typechecker: ts.TypeChecker;

  /**
  param entryPoints either a string array pointing to files to begin analyzing, or an
  existing ts.Program.
  param compilerOptions ignored when entryPoints is an existing ts.Program.  Used when
  instantiating a new ts.Program from the given entryPoints.
  */
  constructor(entryPoints: string[]|ts.Program, compilerOptions: ts.CompilerOptions = {}) {
    if (entryPoints instanceof Array) {
      (<string[]>entryPoints).forEach((entryPoint: string) => {
        if (!fs.existsSync(entryPoint)) {
          throw new Error("File " + entryPoint + " could not be found!")
        }
      });
      this.program = ts.createProgram(<string[]>entryPoints, compilerOptions);
    } else {
      this.program = <any>entryPoints;
    }
    this.typechecker = this.program.getTypeChecker();
  }

  /**
  returns a statements.Source for all entry points for the current host
  param recursive passed in to the .analyze call for each source.
  */
  analyzeAll(recursive = false): statements.Source[] {
    return this.program.getSourceFiles().map((sf: ts.SourceFile) => {
      return this.analyze(sf.fileName, recursive);
    })
  }

  /**
  param source either the filepath or source instance matching a source file to analyze.
  param recursive passed through to getAnalyzer.
  returns a statement.Source object for the given file, or null if such a file could
  not be found by the host's ts.Program.
  */
  analyze(source: string|statements.Source, recursive = false): statements.Source {
    return this.getAnalyzer(source, recursive).analyze();
  }

  /**
  param source non null representing the source filepath our statements.Source to analyze.
  param recursive passed through to the constructor of SourceAnalyzer.
  returns a new SourceAnalyzer matching the given source.
  */
  getAnalyzer(source: string|statements.Source, recursive: boolean = false) {
    if (source == null) {
      throw new Error("Null source passed to getAnalyzer!");
    }

    var resolvedSource = this.getSource(source);
    var sourceFile = this.program.getSourceFile(resolvedSource.fileName);
    if (sourceFile == null) {
      throw new Error("Source " + source + " could not be found in the runtime.");
    }
    return new SourceAnalyzer(this, resolvedSource, sourceFile, recursive);
  }

  /**
    returns the corresponding statements.Source after normalizing the input
    sourcePath.
  */
  getSource(sourcePath: string|statements.Source): statements.Source {
    if (sourcePath instanceof statements.Source) return sourcePath;

    var normalizedPath = path.normalize(<string>sourcePath);
    if (!(normalizedPath in this.sources)) {
      this.sources[normalizedPath] = new statements.Source(normalizedPath);
    }

    return this.sources[normalizedPath];
  }
}

/**
  An object that represents the configuration of a source file's analyzation
  work.  No state is kept on the analyzer itself, so multiple of these can
  be constructed for the same configuration.
*/
export class SourceAnalyzer {
  /**
  param recursive When true, all analyzer functions will recursively analyze any other block
  found within.  When false, only the most shallow level of statements will be analyzed, and the
  caller must manually analyze for any other depth.
  */
  constructor(
    private host: AnalyzerHost, private source: statements.Source, private sourceFile: ts.SourceFile,
    private recursive: boolean
    ) { }

  /**
  Analyzes the top level source statements and fills the statements.  Source elements array
  with new CodeNodes corresponding to the analyzed AST.  Please see the recursive constructor
  parameter.

  analyze and analyzeBody both will not re-analyze the same block twice
  upon multiple invocations without a call to the block's own resetBody().
  This makes these calls idempotent and safe to call multiple times without
  mutating existing state.
  */
  analyze() {
    this.source
      .registerWithNode(this.sourceFile)
      .setText(this.sourceFile.getFullText(this.sourceFile));
    return this.performBlockAnalysis(this.source, this.sourceFile.statements,
      this.analyzeModuleElement.bind(this));
  }

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
  analyzeBody(block: statements.AbstractBlock) {
    if (block instanceof statements.Enumeration) {
      this.analyzeEnumBody(block);
    } else if (block instanceof statements.Interface) {
      this.analyzeInterfaceBody(block);
    } else if (block instanceof statements.Module) {
      this.analyzeModuleBody(block);
    } else if (block instanceof statements.Function) {
      this.analyzeFunctionBody(block);
    } else if (block instanceof statements.Lambda) {
      this.analyzeLambdaBody(block);
    } else if (block instanceof statements.Class) {
      this.analyzeClassBody(block);
    } else if (block instanceof statements.Case) {
      this.analyzeCaseBody(block);
    } else if (block instanceof statements.Switch) {
      this.analyzeSwitchBody(block);
    } else if (block instanceof statements.ObjectLiteral) {
      this.analyzeObjectLiteralBody(block);
    } else if (block instanceof statements.VariableDeclaration) {
      this.analyzeVariableDeclaration(block);
    } else if (block.constructor === statements.CodeBlock) {
      this.analyzeCodeBlock(block);
    } else if (block instanceof statements.ArrayLiteral) {
      this.analyzeArrayLiteralBody(block);
    } else if (block instanceof statements.TypeLiteral) {
      this.analyzeTypeLiteralBody(block);
    } else {
      throw new Error("SourceAnalyze cannot analyze block of type " + (<any>block.constructor)["name"]);
    }

    return block;
  }

  private performBlockAnalysis<NodeType extends ts.Node, BlockType extends statements.AbstractBlock>(
    block: BlockType,
    elements: NodeType[],
    elementAnalyzer: (e: NodeType) => statements.CodeNode,
    ignoreTrailing = false
    ): BlockType {
    if (!block.canAnalyzeBody()) return block;

    elements.forEach((e: NodeType) => {
      var codeNode: statements.CodeNode;
      try {
        codeNode = elementAnalyzer(e);
      } catch (err) {
        if (strictMode) {
          throw err;
        } else {
          codeNode = new statements.CodeNode();
          codeNode.registerWithNode(e);
          codeNode.setText(e.getText());
        }
      }
      this.addToBlock(codeNode, block, e);
    });

    if (!ignoreTrailing) {
      this.addTrailingBlockSpacing(block, block.node);
    }

    block.bodyHasBeenAnalyzed = true;
    return block;
  }

  private addToBlock<T extends statements.CodeNode>(statement: T, block: statements.AbstractBlock, element: ts.Node) {
    var expressionText = this.addSpacingAndGetExpressionText(element, block);
    statement.setText(expressionText);
    block.elements.push(statement);
  }

  private analyzeCodeBlock(block: statements.CodeBlock) {
    var blockStatement = <ts.Block>block.node;
    this.performBlockAnalysis(block, blockStatement.statements, (s) => this.analyzeStatement(s));
    return block;
  }

  private analyzeModuleBody(module: statements.Module) {
    var moduleDeclaration = <ts.ModuleDeclaration>module.node;

    var body = moduleDeclaration.body;
    while (body.kind == ts.SyntaxKind.ModuleDeclaration) {
      body = (<ts.ModuleDeclaration>body).body;
    }

    return this.performBlockAnalysis(module, (<ts.ModuleBlock>body).statements, this.analyzeModuleElement.bind(this));
  }

  private analyzeModuleQualifiedName(moduleDeclaration: ts.ModuleDeclaration): statements.ModuleDeclarationName {
    var name: statements.ModuleDeclarationName = this.tryAnalyzeAtomicValue(moduleDeclaration.name);
    if (name != null) return name;

    while (moduleDeclaration.kind == ts.SyntaxKind.ModuleDeclaration) {
      name = new statements.QualifiedName(
        this.getIdentifierName(moduleDeclaration.name),
        <statements.QualifiedName>name);
      name.registerWithNode(moduleDeclaration).setText(moduleDeclaration.getText());
      moduleDeclaration = <ts.ModuleDeclaration>moduleDeclaration.body;
    }

    if (name == null) this.failAnalysis(moduleDeclaration, "module qualified name");
    return name;
  }

  private analyzeModuleDeclaration(moduleDeclaration: ts.ModuleDeclaration) {
    var result = new statements.Module(
      this.analyzeModuleQualifiedName(moduleDeclaration),
      this.analyzeModifiers(moduleDeclaration));
    result.registerWithNode(moduleDeclaration).setText(moduleDeclaration.getText());

    if (this.recursive) this.analyzeModuleBody(result);

    return result;
  }

  private analyzeModuleElement(moduleElement: ts.ModuleElement): statements.CodeNode {
    switch (moduleElement.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        return this.analyzeClassDeclaration((<ts.ClassDeclaration>moduleElement));
      case ts.SyntaxKind.ImportEqualsDeclaration:
        var importEquals = (<ts.ImportEqualsDeclaration>moduleElement);
        if (importEquals.moduleReference.kind == ts.SyntaxKind.ExternalModuleReference) {
          return this.analyzeRequireImport(importEquals,
            <ts.ExternalModuleReference>importEquals.moduleReference);
        } else if ([
          ts.SyntaxKind.QualifiedName,
          ts.SyntaxKind.Identifier
        ].indexOf(importEquals.moduleReference.kind) != -1) {
          return this.analyzeInternalModuleImport(importEquals, <ts.EntityName>importEquals.moduleReference);
        } else {
          this.failAnalysis(importEquals.moduleReference, "moduleReference");
        }
      case ts.SyntaxKind.ModuleDeclaration:
        return this.analyzeModuleDeclaration(<ts.ModuleDeclaration>moduleElement);
      case ts.SyntaxKind.EnumDeclaration:
        return this.analyzeEnumDeclaration(<ts.EnumDeclaration>moduleElement);
      case ts.SyntaxKind.TypeAliasDeclaration:
        return this.analyzeTypeAliasDeclaration(<ts.TypeAliasDeclaration>moduleElement);
      case ts.SyntaxKind.InterfaceDeclaration:
        return this.analyzeInterfaceDeclaration(<ts.InterfaceDeclaration>moduleElement);
      case ts.SyntaxKind.ImportDeclaration:
        return this.analyzeImportDeclaration(<ts.ImportDeclaration>moduleElement);
      default:
        return this.analyzeStatement(<ts.Statement>moduleElement);
    }
  }

  private getTemplateLiteralPiece(le: ts.LiteralExpression): statements.TemplateLiteralPiece {
    var start = 1;
    var text = le.getText();
    var end = text.length - 1;

    if (text.substr(text.length - 2, 2) == "${") {
      end = text.length - 2;
    }

    text = text.substring(start, end);
    var result = statements.TemplateLiteralPiece.fromToken(text);
    result.registerWithNode(le).setText(text);
    return result;
  }

  private analyzeElementDeclarationName(elementDeclarationName: ts.DeclarationName) {
    var keyName: statements.ElementDeclarationName = this.tryAnalyzeAtomicValue(elementDeclarationName);
    if (keyName == null) {
      if (elementDeclarationName.kind == ts.SyntaxKind.Identifier) {
        keyName = this.analyzeIdentifier(<ts.Identifier>elementDeclarationName);
      } else {
        var analyzed = this.analyzeDeclarationName(elementDeclarationName);
        if (analyzed instanceof statements.Identifier) {
          keyName = analyzed;
        } else if (analyzed instanceof statements.ComputedDeclarationName) {
          keyName = analyzed;
        } else {
          this.failAnalysis(elementDeclarationName, "elementDeclarationName")
        }
      }
    }
    keyName.setText(elementDeclarationName.getText()).registerWithNode(elementDeclarationName);
    return keyName;
  }

  private analyzeObjectLiteralElement(element: ts.ObjectLiteralElement): statements.ObjectLiteralElement {
    var keyName: statements.ElementDeclarationName;
    var initializer: statements.Expression;
    switch (element.kind) {
      case ts.SyntaxKind.GetAccessor:
        return this.analyzeAccessor(<any>element, true);
      case ts.SyntaxKind.SetAccessor:
        return this.analyzeAccessor(<any>element, false);
      case ts.SyntaxKind.MethodDeclaration:
        return this.analyzeFunction(<ts.MethodDeclaration>element, true);
      case ts.SyntaxKind.PropertyAssignment:
        let propAssign = <ts.PropertyAssignment>element;
        keyName = this.analyzeElementDeclarationName(propAssign.name);
        initializer = this.analyzeExpression(propAssign.initializer);
        break;
      case ts.SyntaxKind.ShorthandPropertyAssignment:
        let propShort = <ts.ShorthandPropertyAssignment>element;
        keyName = this.analyzeIdentifier(propShort.name);
        break;
      default:
        this.failAnalysis(element, "object literal element");
    }

    var result = new statements.ObjectLiteralProperty(keyName, initializer);
    result.registerWithNode(element).setText(element.getText());
    return result;
  }

  private analyzeObjectLiteralBody(objectLiteral: statements.ObjectLiteral) {
    var obj = <ts.ObjectLiteralExpression>objectLiteral.node;
    return this.performBlockAnalysis(
      objectLiteral, obj.properties, this.analyzeObjectLiteralElement.bind(this));
  }

  private analyzeObjectLiteral(objectLiteral: ts.ObjectLiteralExpression) {
    var result = new statements.ObjectLiteral();
    result.registerWithNode(objectLiteral).setText(objectLiteral.getText());
    if (this.recursive) this.analyzeObjectLiteralBody(result);
    return result;
  }

  private analyzeArrayLiteralBody(arrayLiteral: statements.ArrayLiteral) {
    var arr = <ts.ArrayLiteralExpression>arrayLiteral.node;
    return this.performBlockAnalysis(arrayLiteral, arr.elements, this.analyzeExpression.bind(this))
  }

  private analyzeArrayLiteral(arrayLiteral: ts.ArrayLiteralExpression) {
    var result = new statements.ArrayLiteral();
    result.registerWithNode(arrayLiteral).setText(arrayLiteral.getText());
    if (this.recursive) this.analyzeArrayLiteralBody(result);
    return result;
  }

  private tryAnalyzeAtomicValue(node: ts.Node) {
    var result: statements.AtomicValue;

    switch (node.kind) {
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.NullKeyword:
      case ts.SyntaxKind.TrueKeyword:
        var text = node.getText();
        result = new statements.AtomicValue(text);
        result.registerWithNode(node).setText(text);
    }

    return result;
  }

  private analyzeExpression(expr: ts.Expression): statements.Expression {
    if (expr == null) return null;
    var result: statements.Expression;
    var prefix = false;

    switch (expr.kind) {
      case ts.SyntaxKind.TaggedTemplateExpression:
        let tagExpr = <ts.TaggedTemplateExpression>expr;
        result = new statements.TaggedTemplate(
          this.analyzeExpression(tagExpr.tag),
          <statements.TemplatePattern>this.analyzeExpression(tagExpr.template)
          )
        break;
      case ts.SyntaxKind.SpreadElementExpression:
        let spreadEle = <ts.SpreadElementExpression>expr;
        result = new statements.Spread(this.analyzeExpression(spreadEle.expression));
        break;
      case ts.SyntaxKind.OmittedExpression:
        result = new statements.EmptyExpression();
        break;
      case ts.SyntaxKind.TypeAssertionExpression:
        let typeAssert = <ts.TypeAssertion>expr;
        result =
        new statements.TypeAssertion(this.analyzeExpression(typeAssert.expression),
          this.analyzeTypes([typeAssert.type])[0]);
        break;
      case ts.SyntaxKind.FunctionExpression:
        let funcExp = <ts.FunctionExpression>expr;
        result = this.analyzeFunction(funcExp);
        break;
      case ts.SyntaxKind.ElementAccessExpression:
        let eleAcc = <ts.ElementAccessExpression>expr;
        result = new statements.ElementAccess(this.analyzeExpression(eleAcc.expression),
          this.analyzeExpression(eleAcc.argumentExpression));
        break;
      case ts.SyntaxKind.NewExpression:
        let newExpr = <ts.NewExpression>expr;
        result = new statements.New(this.analyzeCallExpression(newExpr));
        break;
      case ts.SyntaxKind.CallExpression:
        let callExpr = <ts.CallExpression>expr;
        result = this.analyzeCallExpression(callExpr);
        break;
      case ts.SyntaxKind.ObjectLiteralExpression:
        result = this.analyzeObjectLiteral(<ts.ObjectLiteralExpression>expr);
        break;
      case ts.SyntaxKind.ArrayLiteralExpression:
        result = this.analyzeArrayLiteral(<ts.ArrayLiteralExpression>expr);
        break;
      case ts.SyntaxKind.Identifier:
        result = this.analyzeIdentifier(<ts.Identifier>expr);
        break;
      case ts.SyntaxKind.TypeOfExpression:
        let typeOfExpr = <ts.TypeOfExpression>expr;
        result = new statements.TypeOf(this.analyzeExpression(typeOfExpr.expression));
        break;
      case ts.SyntaxKind.DeleteExpression:
        let delExp = <ts.DeleteExpression>expr;
        result = new statements.Delete(this.analyzeExpression(delExp.expression));
        break;
      case ts.SyntaxKind.ArrowFunction:
        let arrFun = <ts.ArrowFunction>expr;
        result = this.analyzeLambda(arrFun);
        break;
      case ts.SyntaxKind.ThisKeyword:
      case ts.SyntaxKind.SuperKeyword:
        result = new statements.Identifier(expr.getText());
        break;
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.NullKeyword:
      case ts.SyntaxKind.TrueKeyword:
        result = this.tryAnalyzeAtomicValue(expr);
        break;
      case ts.SyntaxKind.RegularExpressionLiteral:
        let regex = <ts.LiteralExpression>expr;
        var lastSlash = regex.text.lastIndexOf("/");
        var body = regex.text.substring(1, lastSlash);
        var flags = regex.text.substring(lastSlash + 1, regex.text.length).split("");
        result = new statements.RegexLiteral(body, flags);
        break;
      case ts.SyntaxKind.ConditionalExpression:
        let cnd = <ts.ConditionalExpression>expr;
        result = new statements.TernaryOperation([
          cnd.questionToken.getText(),
          cnd.colonToken.getText()
        ], [
            this.analyzeExpression(cnd.condition),
            this.analyzeExpression(cnd.whenTrue), this.analyzeExpression(cnd.whenFalse)
          ]);
        break;
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        result = new statements.TemplatePattern([this.getTemplateLiteralPiece(<ts.LiteralExpression>expr)]);
        break;
      case ts.SyntaxKind.TemplateExpression:
        let template = <ts.TemplateExpression>expr;
        let templateParts: statements.TemplatePart[] = [this.getTemplateLiteralPiece(template.head)];
        template.templateSpans.forEach((s: ts.TemplateSpan) => {
          templateParts.push(this.analyzeExpression(s.expression));
          templateParts.push(this.getTemplateLiteralPiece(s.literal));
        });
        result = new statements.TemplatePattern(templateParts);
        break;
      case ts.SyntaxKind.VoidExpression:
        let voidExpr = <ts.VoidExpression>expr;
        result = new statements.Void(this.analyzeExpression(voidExpr.expression));
        break;
      case ts.SyntaxKind.PrefixUnaryExpression:
        prefix = true;
      case ts.SyntaxKind.PostfixUnaryExpression:
        let unary = <ts.PrefixUnaryExpression>expr;
        var operator = (prefix ? expr.getChildAt(0) : expr.getChildAt(1)).getText();
        result = new statements.UnaryOperation(operator, this.analyzeExpression(unary.operand), !prefix);
        break;
      case ts.SyntaxKind.ParenthesizedExpression:
        let paren = <ts.ParenthesizedExpression>expr;
        result = new statements.Parenthetical(this.analyzeExpression(paren.expression));
        break;
      case ts.SyntaxKind.BinaryExpression:
        let binary = <ts.BinaryExpression>expr;
        result = new statements.BinaryOperation(binary.operatorToken.getText(),
          this.analyzeExpression(binary.left),
          this.analyzeExpression(binary.right));
        break;
      case ts.SyntaxKind.PropertyAccessExpression:
        let prop = <ts.PropertyAccessExpression>expr;
        result = new statements.PropertyAccess(this.analyzeExpression(prop.expression), prop.name.text);
        break;
      default:
        this.failAnalysis(expr, "expression");
    }

    result.registerWithNode(expr).setText(expr.getText());
    return result;
  }

  private analyzeCallExpression(callExpr: ts.CallExpression) {
    var argExpressions: statements.Expression[] = null;
    if (callExpr.arguments != null) {
      argExpressions = callExpr.arguments.map((c) => { return this.analyzeExpression(c) })
    }
    var result = new statements.Call(
      this.analyzeExpression(callExpr.expression),
      argExpressions,
      this.analyzeTypes(callExpr.typeArguments));
    result.registerWithNode(callExpr).setText(callExpr.getText());
    return result;
  }

  private analyzeEnumBody(enumeration: statements.Enumeration) {
    var enumDeclaration = <ts.EnumDeclaration>enumeration.node;
    return this.performBlockAnalysis(enumeration, enumDeclaration.members, this.analyzeEnumElement.bind(this));
  }

  private analyzeEnumElement(m: ts.EnumMember): statements.EnumEntry {
    var result = new statements.EnumEntry(this.analyzeElementDeclarationName(m.name),
      this.analyzeExpression(m.initializer));
    result.registerWithNode(m).setText(m.getText());
    return result;
  }

  private analyzeEnumDeclaration(enumDeclaration: ts.EnumDeclaration) {
    var result = new statements.Enumeration(enumDeclaration.name.text, this.analyzeModifiers(enumDeclaration));
    result.registerWithNode(enumDeclaration).setText(enumDeclaration.getText());
    if (this.recursive) this.analyzeEnumBody(result);
    return result;
  }

  private analyzeTypeAliasDeclaration(alias: ts.TypeAliasDeclaration) {
    var result = new statements.TypeAlias(
      alias.name.text,
      this.analyzeTypes([alias.type])[0],
      this.analyzeModifiers(alias)
      );

    result.registerWithNode(alias).setText(alias.getText());
    return result;
  }

  private analyzeInterfaceDeclaration(interfaceDeclaration: ts.InterfaceDeclaration) {
    var modifiers = this.analyzeModifiers(interfaceDeclaration);
    var typeParameters: statements.TypeParameter[] = [];
    if (interfaceDeclaration.typeParameters) {
      typeParameters = this.analyzeTypeParameters(interfaceDeclaration.typeParameters);
    }

    var extendedInterfaces: statements.QualifiedTypeName[] = [];
    if (interfaceDeclaration.heritageClauses) {
      interfaceDeclaration.heritageClauses.forEach((heritage: ts.HeritageClause) => {
        if (heritage.token == ts.SyntaxKind.ExtendsKeyword) {
          heritage.types.forEach((t: ts.ExpressionWithTypeArguments) => {
            extendedInterfaces.push(this.analyzeHeritageClause(t))
          })
        } else {
          throw new Error("Unsure how to analyze interface heritage clause " + heritage.getText());
        }
      })
    }

    var result = new statements.Interface(interfaceDeclaration.name.text,
      typeParameters, extendedInterfaces, modifiers);
    result.registerWithNode(interfaceDeclaration
      ).setText(interfaceDeclaration.getText());

    if (this.recursive) this.analyzeInterfaceBody(result);

    return result;
  }

  private analyzeInterfaceBody(intface: statements.Interface) {
    var interfaceDeclaration = <ts.InterfaceDeclaration>intface.node;
    return this.performBlockAnalysis(intface, interfaceDeclaration.members, this.analyzeProperty.bind(this));
  }

  private analyzeTypeLiteralBody(typeLiteral: statements.TypeLiteral) {
    var type = <ts.TypeLiteralNode>typeLiteral.node;
    return this.performBlockAnalysis(typeLiteral, type.members, this.analyzeProperty.bind(this));
  }

  private analyzeTypeLiteral(typeLiteral: ts.TypeLiteralNode) {
    var result = new statements.TypeLiteral();
    result.setText(typeLiteral.getText()).registerWithNode(typeLiteral);
    if (this.recursive) this.analyzeTypeLiteralBody(result);
    return result;
  }

  private addSpacingAndGetExpressionText(node: ts.Node, block: statements.AbstractBlock): string {
    var fullText: string = node.getFullText(this.sourceFile);
    var filler = fullText.substr(0, node.getStart(this.sourceFile) - node.getFullStart());
    if (filler.length > 0) {
      block.elements.push(new statements.Trivia(filler));
    }

    var shortText = node.getText();
    if (shortText[shortText.length - 1] == ";") shortText = shortText.substr(0, shortText.length - 1);
    return shortText;
  }

  private analyzeRequireImport(
    importStatement: ts.ImportEqualsDeclaration,
    moduleReference: ts.ExternalModuleReference
    ) {
    var result = new statements.RequireImport(
      this.analyzeIdentifier(importStatement.name), this.analyzeExpression(moduleReference.expression), this.analyzeModifiers(importStatement));
    result.registerWithNode(importStatement).setText(importStatement.getText());
    return result;
  }

  private analyzeInternalModuleImport(importStatement: ts.ImportEqualsDeclaration, moduleReference: ts.EntityName) {
    var moduleName = this.analyzeEntityNameType(moduleReference);
    var result = new statements.InternalModuleImport(importStatement.name.text, moduleName,
      this.analyzeModifiers(importStatement));
    result.registerWithNode(importStatement).setText(importStatement.getText());
    return result;
  }

  private analyzeEntityNameType(qualifiedName: ts.EntityName): statements.QualifiedName {
    var rightSide: statements.QualifiedName;
    var result: statements.QualifiedName;
    var iterName = qualifiedName;

    var unfoldNode = (nextText: string) => {
      let leftSide = new statements.QualifiedName(nextText);
      leftSide.registerWithNode(iterName).setText(iterName.getText());
      if (rightSide != null) rightSide.qualification = leftSide;
      rightSide = leftSide;
      result = result || rightSide;
    };

    while (iterName.kind == ts.SyntaxKind.QualifiedName) {
      unfoldNode((<ts.QualifiedName>iterName).right.text);
      iterName = (<ts.QualifiedName>iterName).left;
    }

    unfoldNode(this.getIdentifierName(iterName));

    return result;
  }

  private analyzeQualifiedNameLikeExpression(expression: ts.LeftHandSideExpression): statements.QualifiedName {
    var name: statements.QualifiedName = null;

    var parts: string[] = [];
    var nodes: ts.Node[] = [];

    var iterExpression: ts.PropertyAccessExpression = <any>expression;
    while (iterExpression.kind == ts.SyntaxKind.PropertyAccessExpression) {
      nodes.push(iterExpression);
      parts.push(iterExpression.name.text);
      iterExpression = <ts.PropertyAccessExpression>iterExpression.expression;
    }

    nodes.push(iterExpression);
    parts.push(this.getIdentifierName(iterExpression));

    var len = parts.length;
    for (var i = 0; i < len; ++i) {
      name = new statements.QualifiedName(parts[len - i - 1], name);
      var node = nodes[len - i - 1];
      name.registerWithNode(node).setText(node.getText());
    }

    return name;
  }

  private analyzeCallable(
    signature: ts.SignatureDeclaration,
    isPropertyType: boolean,
    keywordName: statements.Identifier = null
    ): statements.Callable {
    var returnType: statements.Type = this.analyzeTypes([signature.type])[0];
    var args: statements.Property[] = signature.parameters.map((p) => {
      return <statements.Property>this.analyzeProperty(p);
    });
    var typeParameters = this.analyzeTypeParameters(signature.typeParameters);

    var name: statements.DeclarationName = keywordName;
    if (signature.name != null) {
      name = this.analyzeDeclarationName(signature.name);
    }

    var result: statements.Callable;
    if (isPropertyType) {
      result = new statements.CallableType(name, args, returnType, typeParameters, !!(<any>signature)["questionToken"]);
    } else {
      result = new statements.CallableSignature(name, args, returnType, typeParameters, !!(<any>signature)["questionToken"]);
    }
    result.registerWithNode(signature).setText(signature.getText());
    return result;
  }

  private analyzeCallableType(signature: ts.SignatureDeclaration, keywordName: statements.Identifier = null): statements.CallableType {
    return <statements.CallableType>this.analyzeCallable(signature, true, keywordName);
  }

  private analyzeCallableSignature(
    signature: ts.SignatureDeclaration,
    keywordName: statements.Identifier = null
    ): statements.CallableSignature {
    return <statements.CallableSignature>this.analyzeCallable(signature, false, keywordName);
  }

  private analyzeTypes(types: (ts.TypeNode|ts.Declaration)[]): statements.Type[] {
    if (types == null) return [];

    return types.map((type: ts.TypeNode|ts.Declaration) => {
      if (type == null) return null;

      var isConstructorType = false;
      var result: statements.Type;
      switch (type.kind) {
        case ts.SyntaxKind.TypeQuery:
          var typeQuery = <ts.TypeQueryNode>type;
          result = new statements.TypeOf(this.analyzeEntityNameType(typeQuery.exprName).asExpression());
          break;
        case ts.SyntaxKind.ParenthesizedType:
          var parType = <ts.ParenthesizedTypeNode>type;
          result = new statements.ParenthesizedType(this.analyzeTypes([parType.type])[0]);
          break;
        case ts.SyntaxKind.TupleType:
          var tupleType = <ts.TupleTypeNode>type;
          result = new statements.TupleType(this.analyzeTypes(tupleType.elementTypes));
          break;
        case ts.SyntaxKind.TypeReference:
          var typeReference = <ts.TypeReferenceNode>type;
          result = new statements.QualifiedTypeName(
            this.analyzeEntityNameType(typeReference.typeName),
            this.analyzeTypes(typeReference.typeArguments));
          break;
        case ts.SyntaxKind.ArrayType:
          var arrayType = <ts.ArrayTypeNode>type;
          result = new statements.ArrayType(this.analyzeTypes([arrayType.elementType])[0]);
          break;
        case ts.SyntaxKind.UnionType:
          result = new statements.UnionType(this.analyzeTypes((<ts.UnionTypeNode>type).types));
          break;
        case ts.SyntaxKind.TypeLiteral:
          result = this.analyzeTypeLiteral(<ts.TypeLiteralNode>type);
          break;
        case ts.SyntaxKind.ConstructorType:
          isConstructorType = true;
        case ts.SyntaxKind.FunctionType:
          var signature = <ts.SignatureDeclaration>type;
          var constructorName: statements.Identifier = null;
          if (isConstructorType) {
            constructorName = new statements.Identifier("new");
            constructorName.setText("new");
            constructorName.registerWithNode(type);
          }
          result = this.analyzeCallableType(signature, constructorName);
          break;
        case ts.SyntaxKind.AnyKeyword:
        case ts.SyntaxKind.BooleanKeyword:
        case ts.SyntaxKind.StringKeyword:
        case ts.SyntaxKind.NumberKeyword:
        case ts.SyntaxKind.VoidKeyword:
        case ts.SyntaxKind.SymbolKeyword:
          result = new statements.KeywordType(type.getText());
          break;
        default:
          this.failAnalysis(type, "type");
      }

      result.registerWithNode(type).setText(type.getText());
      return result;
    });
  }

  private analyzeTypeParameters(typeParameterDeclarations: ts.TypeParameterDeclaration[]): statements.TypeParameter[] {
    if (typeParameterDeclarations == null) return [];

    return typeParameterDeclarations.map((declaration: ts.TypeParameterDeclaration) => {
      var constraint: statements.Type = null;
      if (declaration.constraint) {
        constraint = this.analyzeTypes([declaration.constraint])[0];
      }
      var result = new statements.TypeParameter(declaration.name.text, constraint);
      result.registerWithNode(declaration).setText(declaration.getText());
      return result;
    });
  }

  private analyzeModifiers(nodeWithModifiers: { modifiers?: ts.Node[] }) {
    if (nodeWithModifiers.modifiers) {
      return nodeWithModifiers.modifiers.map((n: ts.Node) => { return n.getText(); });
    } else {
      return [];
    }
  }

  private analyzeClassDeclaration(classDeclaration: ts.ClassDeclaration) {
    var className = classDeclaration.name.text;
    var interfaces: statements.QualifiedTypeName[] = [];
    var parentClass: statements.QualifiedTypeName = null;
    var modifiers: string[] = this.analyzeModifiers(classDeclaration);
    var typeParameters: statements.TypeParameter[] = [];
    var decorators: statements.Expression[] = [];

    if (classDeclaration.decorators != null) {
      decorators = classDeclaration.decorators.map((d) => this.analyzeExpression(d.expression));
    }

    if (classDeclaration.typeParameters) {
      typeParameters = this.analyzeTypeParameters(classDeclaration.typeParameters);
    }

    if (classDeclaration.heritageClauses) {
      classDeclaration.heritageClauses.forEach((heritage: ts.HeritageClause) => {
        if (heritage.token == ts.SyntaxKind.ImplementsKeyword) {
          heritage.types.forEach((type: ts.ExpressionWithTypeArguments) => {
            interfaces.push(this.analyzeHeritageClause(type));
          });
        } else if (heritage.token == ts.SyntaxKind.ExtendsKeyword && heritage.types.length > 0) {
          parentClass = this.analyzeHeritageClause(heritage.types[0]);
        } else {
          this.failAnalysis(heritage, "heritage clause");
        }
      });
    }

    var result = new statements.Class(className, modifiers, parentClass, typeParameters, interfaces, decorators);
    result.registerWithNode(classDeclaration).setText(classDeclaration.getText());

    if (this.recursive) this.analyzeClassBody(result);

    return result;
  }

  private analyzeClassBody(klass: statements.Class) {
    var classDeclaration = <ts.ClassDeclaration>klass.node;

    if (classDeclaration.members == null) {
      klass.bodyHasBeenAnalyzed = true;
      return klass;
    }

    return this.performBlockAnalysis(klass, classDeclaration.members, this.analyzeClassElement.bind(this));
  }

  private addTrailingBlockSpacing(block: statements.AbstractBlock, blockNode: ts.Node) {
    var lastToken: ts.Node;
    if (block instanceof statements.Source) {
      lastToken = block.sourceNode.endOfFileToken;
    } else {
      lastToken = blockNode.getLastToken(this.sourceFile);
    }

    if (lastToken == null) return;

    if (block.elements.length > 0 && lastToken == block.elements[block.elements.length - 1].node)
      return;

    var trailing = lastToken.getFullText().substring(0, lastToken.getLeadingTriviaWidth());

    if (trailing.length > 0) {
      block.elements.push(new statements.Trivia(trailing));
    }
  }

  private analyzeLambda(arrFunction: ts.ArrowFunction) {
    var signature = this.analyzeCallableSignature(arrFunction);
    var result = new statements.Lambda(signature);
    result.registerWithNode(arrFunction).setText(arrFunction.getText());

    if (arrFunction.getText()[0] != "(")
      result.withoutParanthesis = true;

    if (this.recursive) this.analyzeLambdaBody(result);

    return result;
  }

  private analyzeLambdaBody(lambda: statements.Lambda) {
    var arrFunction = <ts.ArrowFunction>lambda.node;
    if (arrFunction.body.kind == ts.SyntaxKind.Block) {
      this.performBlockAnalysis(lambda, (<ts.Block>arrFunction.body).statements, this.analyzeStatement.bind(this));
    } else {
      this.performBlockAnalysis(lambda, [(<ts.Expression>arrFunction.body)], this.analyzeExpression.bind(this));
      lambda.isSingleExpression = true;
    }
  }

  private analyzeFunction(
    functionDeclaration: ts.FunctionLikeDeclaration,
    isMethod = false,
    keywordName: statements.Identifier = null
    ) {

    var modifiers = this.analyzeModifiers(functionDeclaration);
    var signature = this.analyzeCallableSignature(functionDeclaration, keywordName);
    var decorators: statements.Expression[] = [];

    if (functionDeclaration.decorators != null) {
      decorators = functionDeclaration.decorators.map(d => this.analyzeExpression(d.expression));
    }

    var result = new statements.Function(signature, modifiers, isMethod, !functionDeclaration.body, decorators);
    result.registerWithNode(functionDeclaration).setText(functionDeclaration.getText());

    if (this.recursive) this.analyzeFunctionBody(result);

    return result;
  }

  private analyzeFunctionBody(func: statements.Function) {
    var functionDeclaration = <ts.FunctionLikeDeclaration>func.node;

    if (functionDeclaration.body == null) {
      func.bodyHasBeenAnalyzed = true;
      return func;
    }

    if (functionDeclaration.body.kind != ts.SyntaxKind.Block) {
      this.failAnalysis(functionDeclaration.body, "function body");
    }
    return this.performBlockAnalysis(func, (<ts.Block>functionDeclaration.body).statements,
      this.analyzeStatement.bind(this));
  }

  analyzeVariableDeclaration(variables: statements.VariableDeclaration) {
    var variableStatement = variables.node;
    var ignoreTrailing = false;

    var declarationList: ts.VariableDeclarationList;
    if (variableStatement.kind == ts.SyntaxKind.VariableStatement) {
      declarationList = (<ts.VariableStatement>variableStatement).declarationList;
    } else {
      ignoreTrailing = true;
      declarationList = <any>variableStatement;
    }

    return this.performBlockAnalysis(variables, declarationList.declarations, this.analyzeProperty.bind(this), true);
  }

  private analyzeVariableStatement(variableStatement: ts.VariableStatement|ts.VariableDeclarationList) {
    var declarationList: ts.VariableDeclarationList;
    var modifiers = this.analyzeModifiers(variableStatement);

    if (variableStatement.kind == ts.SyntaxKind.VariableStatement) {
      declarationList = (<ts.VariableStatement>variableStatement).declarationList;
    } else {
      declarationList = <any>variableStatement;
    }

    var type = statements.VariableDeclarationType.VAR;
    if (declarationList.flags & ts.NodeFlags.Let) type = statements.VariableDeclarationType.LET;
    if (declarationList.flags & ts.NodeFlags.Const) type = statements.VariableDeclarationType.CONST;
    var variables = new statements.VariableDeclaration(modifiers, type);
    variables.registerWithNode(variableStatement).setText(variableStatement.getText());

    if (this.recursive) this.analyzeVariableDeclaration(variables);

    return variables;
  }

  private analyzeBlockStatement(statement: ts.Block) {
    if (statement == null) return null;
    var result = new statements.CodeBlock();
    result.registerWithNode(statement).setText(statement.getText());
    if (this.recursive) this.analyzeCodeBlock(result);
    return result;
  }

  private analyzeForInitializer(forStmt: ts.ForInStatement|ts.ForOfStatement|ts.ForStatement) {
    var initializer: statements.VariableDeclaration|statements.Expression;
    if (forStmt.initializer == null) {
      initializer = null;
    } else if (forStmt.initializer.kind == ts.SyntaxKind.VariableDeclarationList) {
      initializer = this.analyzeVariableStatement(<ts.VariableDeclarationList>forStmt.initializer);
    } else {
      initializer = this.analyzeExpression(<any>forStmt.initializer);
      initializer.registerWithNode(forStmt.initializer).setText(forStmt.getText());
    }
    return initializer;
  }

  private analyzeCaseBody(caseStatement: statements.Case) {
    var caseStmt = <ts.CaseClause>caseStatement.node;
    this.performBlockAnalysis(caseStatement, caseStmt.statements, this.analyzeStatement.bind(this));
    return caseStatement;
  }

  private analyzeSwitchBody(switchStatement: statements.Switch) {
    var switchStmt = <ts.SwitchStatement>switchStatement.node;
    this.performBlockAnalysis(switchStatement, switchStmt.caseBlock.clauses, this.analyzeCase.bind(this));
    return switchStatement;
  }

  private analyzeCase(caseStmt: ts.CaseClause) {
    var result = new statements.Case(this.analyzeExpression(caseStmt.expression));
    result.registerWithNode(caseStmt).setText(caseStmt.getText());

    if (this.recursive) this.analyzeCaseBody(result);
    return result;
  }

  private analyzeSwitchStatement(switchStmt: ts.SwitchStatement) {
    var result = new statements.Switch(this.analyzeExpression(switchStmt.expression));
    result.registerWithNode(switchStmt).setText(switchStmt.getText());

    if (this.recursive) this.analyzeSwitchBody(result);

    return result;
  }

  private analyzeStatement(statement: ts.Statement|ts.ModuleElement): statements.CodeNode {
    if (statement == null) return null;
    var result: statements.CodeNode;
    var isDo = false;
    var isOf = false;

    switch (statement.kind) {
      case ts.SyntaxKind.LabeledStatement:
        let labeledStatement = <ts.LabeledStatement>statement;
        result = new statements.LabeledStatement(
          this.analyzeIdentifier(labeledStatement.label),
          this.analyzeStatement(labeledStatement.statement)
          );
        break;
      case ts.SyntaxKind.ExportDeclaration:
        let exportDeclaration = <ts.ExportDeclaration>statement;
        var bindings = this.analyzeNamedImportOrExports(exportDeclaration.exportClause);
        var modulePath = this.analyzeExpression(exportDeclaration.moduleSpecifier);
        result = new statements.ExportDeclaration(bindings, modulePath);
        break;
      case ts.SyntaxKind.ExportAssignment:
        let exportAssignment = <ts.ExportAssignment>statement;
        result = new statements.ExportAssignment(
          this.analyzeExpression(exportAssignment.expression),
          !exportAssignment.isExportEquals);
        break;
      case ts.SyntaxKind.SwitchStatement:
        let switchStmt = <ts.SwitchStatement>statement;
        return this.analyzeSwitchStatement(switchStmt);
      case ts.SyntaxKind.WithStatement:
        let withStmt = <ts.WithStatement>statement;
        result = new statements.With(
          this.analyzeExpression(withStmt.expression),
          this.analyzeStatement(withStmt.statement));
        break;
      case ts.SyntaxKind.ForOfStatement:
        isOf = true;
      case ts.SyntaxKind.ForInStatement:
        let forInStmt = <ts.ForInStatement|ts.ForOfStatement>statement;
        result = new statements.ForInOf(this.analyzeForInitializer(forInStmt),
          this.analyzeExpression(forInStmt.expression),
          this.analyzeStatement(forInStmt.statement), isOf)
        break;
      case ts.SyntaxKind.ForStatement:
        let forStmt = <ts.ForStatement>statement;
        result = new statements.For(this.analyzeForInitializer(forStmt),
          this.analyzeExpression(forStmt.condition),
          this.analyzeExpression(forStmt.incrementor),
          this.analyzeStatement(forStmt.statement));
        break;
      case ts.SyntaxKind.TryStatement:
        let tryStmt = <ts.TryStatement>statement;
        var catchIdentifier: statements.Identifier = null;
        var catchBlock: statements.CodeBlock = null;
        if (tryStmt.catchClause != null) {
          catchIdentifier = this.analyzeIdentifier(<ts.Identifier>tryStmt.catchClause.variableDeclaration.name);
          catchBlock = this.analyzeBlockStatement(tryStmt.catchClause.block);
        }
        result =
        new statements.Try(this.analyzeBlockStatement(tryStmt.tryBlock),
          catchBlock, catchIdentifier,
          this.analyzeBlockStatement(tryStmt.finallyBlock));
        break;
      case ts.SyntaxKind.ThrowStatement:
        let throwStmt = <ts.ThrowStatement>statement;
        result = new statements.Throw(this.analyzeExpression(throwStmt.expression));
        break;
      case ts.SyntaxKind.ReturnStatement:
        let retStmt = <ts.ReturnStatement>statement;
        result = new statements.Return(this.analyzeExpression(retStmt.expression));
        break;
      case ts.SyntaxKind.BreakStatement:
        let breakS = <ts.BreakOrContinueStatement>statement;
        result = new statements.Break(this.analyzeExpression(breakS.label));
        break;
      case ts.SyntaxKind.ContinueStatement:
        let cont = <ts.BreakOrContinueStatement>statement;
        result = new statements.Continue(this.analyzeExpression(cont.label));
        break;
      case ts.SyntaxKind.DebuggerStatement:
        result = new statements.Keyword("debugger");
        break;
      case ts.SyntaxKind.Block:
        return this.analyzeBlockStatement(<ts.Block>statement);
      case ts.SyntaxKind.DoStatement:
        isDo = true;
      case ts.SyntaxKind.WhileStatement:
        let doStmt = <ts.DoStatement|ts.WhileStatement>statement;
        result = new statements.Loop(this.analyzeExpression(doStmt.expression),
          this.analyzeStatement(doStmt.statement), isDo);
        break;
      case ts.SyntaxKind.IfStatement:
        let ifStmt = <ts.IfStatement>statement;
        result = new statements.If(this.analyzeExpression(ifStmt.expression),
          this.analyzeStatement(ifStmt.thenStatement),
          this.analyzeStatement(ifStmt.elseStatement));
        break;
      case ts.SyntaxKind.EmptyStatement:
        result = new statements.EmptyExpression();
        break;
      case ts.SyntaxKind.ExpressionStatement:
        return this.analyzeExpression((<ts.ExpressionStatement>statement).expression);
      case ts.SyntaxKind.VariableStatement:
        return this.analyzeVariableStatement(<ts.VariableStatement>statement);
      case ts.SyntaxKind.FunctionDeclaration:
        return this.analyzeFunction(<ts.FunctionDeclaration>statement, false);
      default:
        this.failAnalysis(statement, "statement");
    }

    result.registerWithNode(statement).setText(statement.getText());
    return result;
  }

  private analyzeAccessor(accessorDeclaration: ts.AccessorDeclaration, isGet: boolean) {
    var result = this.analyzeFunction(<any>accessorDeclaration, true);
    if (isGet) {
      result.modifiers.push("get");
    } else {
      result.modifiers.push("set");
    }
    return result;
  }

  private analyzeClassElement(element: ts.ClassElement): statements.CodeNode {
    switch (element.kind) {
      case ts.SyntaxKind.PropertyDeclaration:
        return this.analyzeProperty(<ts.PropertyDeclaration>element);
      case ts.SyntaxKind.IndexSignature:
        return this.analyzeProperty(<ts.IndexSignatureDeclaration>element);
      case ts.SyntaxKind.Constructor:
        var name = new statements.Identifier("constructor");
        name.setText("constructor").registerWithNode(element);
        return this.analyzeFunction(<any>element, true, name);
      case ts.SyntaxKind.MethodDeclaration:
        return this.analyzeFunction(<ts.MethodDeclaration>element, true);
      case ts.SyntaxKind.SemicolonClassElement:
        var empty = new statements.EmptyExpression();
        empty.setText("").registerWithNode(element);
        return empty;
      case ts.SyntaxKind.GetAccessor:
        return this.analyzeAccessor(<any>element, true);
      case ts.SyntaxKind.SetAccessor:
        return this.analyzeAccessor(<any>element, false);
      default:
        this.failAnalysis(element, "class element");
    }
  }

  private getModifiers(hasModifiers: { modifiers?: ts.Node[] }): string[] {
    if (hasModifiers.modifiers == null) return [];
    return hasModifiers.modifiers.map((n: ts.Node) => { return n.getText(); });
  }

  private analyzeBindingElement(bindingElement: ts.BindingElement): statements.DeclarationBinding {
    var result: statements.DeclarationBinding;

    if (bindingElement.name == null) {
      result = new statements.EmptyExpression();
    } else {
      var propertyName: statements.ElementDeclarationName = null;
      if (bindingElement.propertyName != null) {
        propertyName = this.analyzeElementDeclarationName(bindingElement.propertyName);
      }
      var binding: statements.BindingPropertyName;
      if (bindingElement.name.kind == ts.SyntaxKind.Identifier) {
        binding = this.analyzeIdentifier(<ts.Identifier>bindingElement.name);
      } else if (
        bindingElement.name.kind == ts.SyntaxKind.ObjectBindingPattern ||
        bindingElement.name.kind == ts.SyntaxKind.ArrayBindingPattern
        ) {
        binding = this.analyzeBindingPattern(<ts.BindingPattern>bindingElement.name);
      } else {
        this.failAnalysis(bindingElement.name, "biding element name");
      }

      result = new statements.BindingElement(
        binding, propertyName, !!bindingElement.dotDotDotToken,
        this.analyzeExpression(bindingElement.initializer))
    }

    result.registerWithNode(bindingElement).setText(bindingElement.getText());
    return result;
  }

  private analyzeBindingPattern(pattern: ts.BindingPattern): statements.ArrayBinding|statements.ObjectBinding {
    var result: statements.ArrayBinding|statements.ObjectBinding;
    switch (pattern.kind) {
      case ts.SyntaxKind.ArrayBindingPattern:
        result = new statements.ArrayBinding(pattern.elements.map((e) => this.analyzeBindingElement(e)));
        break;
      case ts.SyntaxKind.ObjectBindingPattern:
        result = new statements.ObjectBinding(pattern.elements.map((e) => this.analyzeBindingElement(e)));
        break;
      default:
        this.failAnalysis(pattern, "binding pattern");
    }

    result.registerWithNode(pattern).setText(pattern.getText());
    return result;
  }

  private analyzeDeclarationName(declarationName: ts.DeclarationName): statements.DeclarationName {
    var result: statements.DeclarationName;

    switch (declarationName.kind) {
      case ts.SyntaxKind.ArrayBindingPattern:
      case ts.SyntaxKind.ObjectBindingPattern:
        let pattern = <ts.BindingPattern>declarationName;
        result = this.analyzeBindingPattern(pattern);
        break;
      case ts.SyntaxKind.ComputedPropertyName:
        let computedProp = <ts.ComputedPropertyName>declarationName;
        result = new statements.ComputedDeclarationName(this.analyzeExpression(computedProp.expression));
        break;
      case ts.SyntaxKind.Identifier:
        result = this.analyzeIdentifier(<ts.Identifier>declarationName);
        break;
      default:
        result = this.tryAnalyzeAtomicValue(declarationName);
        if (result == null)
          this.failAnalysis(declarationName, "declaration name");
    }

    result.registerWithNode(declarationName).setText(declarationName.getText());
    return result;
  }

  private analyzeProperty(property: ts.Declaration): statements.PropertyIndexOrCallable {
    var result: statements.PropertyIndexOrCallable = null;
    var isConstructSignature = false;
    var decorators: statements.Expression[] = [];

    switch (property.kind) {
      case ts.SyntaxKind.IndexSignature:
        let indexSig = <ts.IndexSignatureDeclaration>property;
        var parameter = indexSig.parameters[0];
        var keyName = this.getIdentifierName(parameter.name);
        var keyType = this.analyzeTypes([parameter.type])[0];
        result = new statements.Index(keyName, keyType, this.analyzeTypes([indexSig.type])[0]);
        break;
      case ts.SyntaxKind.ConstructSignature:
        isConstructSignature = true;
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.CallSignature:
        var keywordName: statements.Identifier = null;
        if (isConstructSignature) {
          keywordName = new statements.Identifier("new");
          keywordName.setText("new").registerWithNode(property);
        }
        result = this.analyzeCallableSignature(<ts.SignatureDeclaration>property, keywordName);
        break;
      case ts.SyntaxKind.VariableDeclaration:
      case ts.SyntaxKind.Parameter:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.PropertyDeclaration:
        var prop = <ts.VariableDeclaration|ts.PropertyDeclaration|ts.ParameterDeclaration>property;
        var initializer = this.analyzeExpression(prop.initializer);
        var modifiers = this.getModifiers(prop);
        var propertyType: statements.PropertyTypeQuery = null;
        if (prop.type != null) {
          propertyType = this.tryAnalyzeAtomicValue(prop.type);
          if (propertyType == null) {
            propertyType = this.analyzeTypes([prop.type])[0];
          }
        }

        if (prop.decorators != null) {
          decorators = prop.decorators.map(d => this.analyzeExpression(d.expression));
        }

        result = new statements.Property(
          this.analyzeDeclarationName(prop.name),
          propertyType, initializer, modifiers, decorators,
          !!(<any>prop)["questionToken"], !!(<any>prop)["dotDotDotToken"]
          );
        break;
      default:
        this.failAnalysis(property, "property");
    }

    result.registerWithNode(property).setText(property.getText());
    return result;
  }

  private analyzeHeritageClause(type: ts.ExpressionWithTypeArguments): statements.QualifiedTypeName {
    var generics: statements.Type[] = [];
    if (type.typeArguments) {
      generics = this.analyzeTypes(type.typeArguments);
    }

    var name = new statements.QualifiedTypeName(this.analyzeQualifiedNameLikeExpression(type.expression),
      generics);
    name.setText(type.getText()).registerWithNode(type);
    return name;
  }

  private getStringText(expr: ts.Node) {
    if (expr.kind == ts.SyntaxKind.StringLiteral) {
      let iden = <ts.StringLiteral>expr;
      return iden.text;
    }
    throw new Error("expected to find string literal, found " + expr.getText());
  }

  private analyzeIdentifier(expr: ts.Identifier) {
    if (expr == null) return null;
    if (expr.kind != ts.SyntaxKind.Identifier)
      this.failAnalysis(expr, "identifier");
    var result = new statements.Identifier(expr.text);
    result.setText(expr.getText()).registerWithNode(expr);
    return result;
  }

  private getIdentifierName(expr: ts.Node) {
    if (expr == null) return null;
    if (expr.kind == ts.SyntaxKind.Identifier) {
      let iden = <ts.Identifier>expr;
      return iden.text;
    }
    throw new Error("expected to find identifier, found " + expr.getText() + " kind: " + expr.kind);
  }

  private analyzeNamedImportOrExports(importsOrExports: ts.NamedImportsOrExports): statements.NamedImportOrExports {
    if (importsOrExports == null) return null;
    var names = importsOrExports.elements.map<[statements.Identifier, statements.Identifier]>((specifier: ts.ImportOrExportSpecifier) => {
      if (specifier.propertyName) {
        return [this.analyzeIdentifier(specifier.propertyName), this.analyzeIdentifier(specifier.name)];
      } else {
        return [this.analyzeIdentifier(specifier.name), null];
      }
    });

    var result = new statements.NamedImportOrExports(names);
    result.setText(importsOrExports.getText()).registerWithNode(importsOrExports);
    return result;
  }

  private analyzeImportDeclaration(importDeclaration: ts.ImportDeclaration): statements.Import {
    var modulePath = this.analyzeExpression(importDeclaration.moduleSpecifier);
    var result: statements.Import;

    if (importDeclaration.importClause == null) {
      result = new statements.SimpleImport(modulePath);
    } else {
      var defaultImportedAs = this.analyzeIdentifier(importDeclaration.importClause.name);
      var namespaceBinding: statements.ImportExportsBinding;
      var bindings = importDeclaration.importClause.namedBindings;
      if (bindings != null) {
        if (bindings.kind == ts.SyntaxKind.NamespaceImport) {
          var namespaceImport = <ts.NamespaceImport>bindings;
          namespaceBinding = new statements.NamespaceBinding(this.analyzeIdentifier(namespaceImport.name));
        } else if (bindings.kind == ts.SyntaxKind.NamedImports) {
          namespaceBinding = this.analyzeNamedImportOrExports(<ts.NamedImports>bindings);
        } else {
          this.failAnalysis(bindings, "import named bindings");
        }
        namespaceBinding.registerWithNode(bindings).setText(bindings.getText());
      }

      result = new statements.ES6Import(
        modulePath,
        defaultImportedAs,
        namespaceBinding,
        this.analyzeModifiers(importDeclaration))
    }

    result.registerWithNode(importDeclaration).setText(importDeclaration.getText());
    return result;
  }

  private failAnalysis(node: ts.Node, type: string): any {
    throw new Error("Could not analyze " + type + ": found " + node.getText() + ", kind was " + node.kind);
  }
}
