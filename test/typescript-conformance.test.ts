import { analyzer, statements } from "../index";
import assert = require("assert");
import fs = require("fs");
import path = require("path");

describe("Typescript Conformance @slow", () => {
    var conformancePath = path.join(__dirname, "TypeScript/tests/cases/conformance");
    var baselinePath = path.join(__dirname, "TypeScript/tests/baselines/reference");
    var testCases: string[] = [];
    var dirs: string[] = [conformancePath];

    while (dirs.length > 0) {
        var next = dirs.pop();
        var files = fs.readdirSync(next);
        for (var file of files) {
            var fullFile = path.join(next, file);
            if (fs.statSync(fullFile).isDirectory()) {
                dirs.push(fullFile);
            } else {
                var baseName = path.basename(fullFile, ".ts");
                var errorsPath = path.join(baselinePath, baseName + ".errors.txt");
                if (!fs.existsSync(errorsPath) && fullFile.match(/\.ts$/))
                    testCases.push(fullFile);
            }
        }
    }

    var startFrom = "";
    testCases.sort();
    var idx = testCases.indexOf(startFrom);
    idx = idx == -1 ? 0 : idx;
    testCases = testCases.slice(idx);

    var skipped: string[] = [
        // comments in enums entries.
        "ambient/ambientEnumDeclaration2.ts",
    // tscripter doesn't support comments in template string expressions
        "es6/templates/templateStringWithEmbeddedComments.ts",
        "es6/templates/templateStringWithEmbeddedCommentsES6.ts",
    // tscripter doesn't support comments in ternary operators
        "expressions/typeGuards/typeGuardsInConditionalExpression.ts",
        "expressions/typeGuards/typeGuardsInFunctionAndModuleBlock.ts",
        "expressions/typeGuards/typeGuardsInIfStatement.ts",
        "expressions/typeGuards/typeGuardsInRightOperandOfAndAndOperator.ts",
        "expressions/typeGuards/typeGuardsInRightOperandOfOrOrOperator.ts",
    // tscripter doesn't produce comma separated type literal
        "internalModules/exportDeclarations/ExportObjectLiteralAndObjectTypeLiteralWithAccessibleTypesInNestedMemberTypeAnnotations.ts",
        "parser/ecmascript5/ErrorRecovery/parserCommaInTypeMemberList1.ts",
    // Cleanup code makes testing omitted arrays tricky, but other tests in the fixtures cover it.
        "parser/ecmascript5/ArrayLiteralExpressions/parserArrayLiteralExpression3.ts",
        "parser/ecmascript5/ArrayLiteralExpressions/parserArrayLiteralExpression4.ts",
    // Output will have transformed the unicode escape.
        "parser/ecmascript5/ClassDeclarations/parserClassDeclaration23.ts",
    // More comment nonsense
        "parser/ecmascript5/Generics/parserGreaterThanTokenAmbiguity10.ts",
        "parser/ecmascript5/Generics/parserGreaterThanTokenAmbiguity5.ts",
    // Correct syntax but bad regex in reality.
        "parser/ecmascript5/RegressionTests/parser579071.ts",
    // Unicode escapes are not output.
        "scanner/ecmascript5/scannerUnicodeEscapeInKeyword1.ts",
    // More comments.
        "statements/VariableStatements/recursiveInitializer.ts",
        "types/typeRelationships/assignmentCompatibility/everyTypeAssignableToAny.ts",
    ]

    var substitutions: { [file: string]: { [expected: string]: string } } = {
        // tscripter doesn't support comments in type clauses
        "expressions/binaryOperators/logicalAndOperator/logicalAndOperatorWithTypeParameters.ts": {
            "functionfoo<T,U,V/*extendsT*/>(t:T,u:U,v:V){": "functionfoo<T,U,V>(t:T,u:U,v:V){"
        },
        "expressions/binaryOperators/logicalOrOperator/logicalOrOperatorWithTypeParameters.ts": {
            "functionfn2<T,U/*extendsT*/,V/*extendsT*/>(t:T,u:U,v:V){": "functionfn2<T,U,V>(t:T,u:U,v:V){",
        },
        "statements/breakStatements/doWhileBreakStatements.ts": {
            "dobreakSIX;while(true)": "dobreakSIXwhile(true)",
            "dododobreakSEVEN;while(true)": "dododobreakSEVENwhile(true)"
        },
        "statements/continueStatements/doWhileContinueStatements.ts": {
            "docontinueSIX;while(true)": "docontinueSIXwhile(true)",
            "docontinueSEVEN;while(true)": "docontinueSEVENwhile(true)"
        },
        "types/typeRelationships/assignmentCompatibility/anyAssignableToEveryType.ts": {
            "functionfoo<T,U/*extendsT*/,": "functionfoo<T,U,"
        },
        "types/typeRelationships/assignmentCompatibility/assignmentCompatWithGenericCallSignatures3.ts": {
            "T)=>(y:S)=>U):U}g=h//ok": "T)=>(y:S)=>U):U}g=h;//ok"
        },
        "types/typeRelationships/recursiveTypes/infiniteExpansionThroughTypeInference.ts": {
            "erfaceG<T>{x:G<G<T>>//infinitelyexpandin": "erfaceG<T>{x:G<G<T>>;//infinitelyexpandin",
            "(g:G<T>):void{ff(g)//wheninfering": "(g:G<T>):void{ff(g);//wheninfering"
        },
        "types/typeRelationships/subtypesAndSuperTypes/subtypingWithObjectMembersOptionality3.ts": {
            "xtendsT{Foo2:Derived//ok}interfaceT2": "xtendsT{Foo2:Derived;//ok}interfaceT2"
        },
        "types/typeRelationships/subtypesAndSuperTypes/subtypingWithObjectMembersOptionality4.ts": {
            "tendsT{Foo2?:Derived//ok}": "tendsT{Foo2?:Derived;//ok}"
        },
        "es6/destructuring/destructuringParameterDeclaration1ES6.ts": {
          "nctiona2(o:{x:number,a:number}){}functio": "nctiona2(o:{x:number;a:number}){}functio",
          "q:[a,b,c]}:{j:number,k:string,l:{m:boole": "q:[a,b,c]}:{j:number;k:string;l:{m:boole",
          "string;l:{m:boolean,n:number},q:(number": "string;l:{m:boolean;n:number};q:(number",
          "ona4({x,a}:{x:number,a:number}){}a1([1,2": "ona4({x,a}:{x:number;a:number}){}a1([1,2",
          "{z:number}?c1({z:1})//Impliedtypeis{z:nu": "{z:number}?c1({z:1});//Impliedtypeis{z:nu",
        },
        "es6/destructuring/destructuringVariableDeclaration1ES5.ts": {
          "ar{a1,a2}:{a1:number,a2:string}={a1:10,a": "ar{a1,a2}:{a1:number;a2:string}={a1:10,a",
          "[d1,d2]=[1,\"string\"]//ThetypeTassociated": "[d1,d2]=[1,\"string\"];//ThetypeTassociated",
          "{f:[f1,f2,{f3:f4,f5},]}={f:[1,2,{f3:4,f5": "{f:[f1,f2,{f3:f4,f5}]}={f:[1,2,{f3:4,f5"
        },
        "es6/destructuring/destructuringVariableDeclaration1ES6.ts": {
          "ar{a1,a2}:{a1:number,a2:string}={a1:10,a": "ar{a1,a2}:{a1:number;a2:string}={a1:10,a",
          "[d1,d2]=[1,\"string\"]//ThetypeTassociated": "[d1,d2]=[1,\"string\"];//ThetypeTassociated",
          "{f:[f1,f2,{f3:f4,f5},]}={f:[1,2,{f3:4,f5": "{f:[f1,f2,{f3:f4,f5}]}={f:[1,2,{f3:4,f5",
        },
        "expressions/arrayLiterals/arrayLiterals2ES5.ts": {
          "[()=>1]vara5=[...a0,]//Eachelementexpres": "[()=>1]vara5=[...a0]//Eachelementexpres"
        },
        "expressions/arrayLiterals/arrayLiterals2ES6.ts": {
          "[()=>1]vara5=[...a0,]//Eachelementexpres": "[()=>1]vara5=[...a0]//Eachelementexpres"
        },
        "expressions/contextualTyping/functionExpressionContextualTyping1.ts": {
          "(j,k)=>{return[j,k]}//Perspec,nocontext": "(j,k)=>{return[j,k]};//Perspec,nocontext"
        }
    }

    beforeEach(() => { analyzer.strictMode = true; });

    function cleanFace(s: string) {
        return s
            .replace(/,\s*]/g, "]")
            .replace(/;\s*}/g, "}")
            .replace(/,\s*}/g, "}")
            .replace(/;\n/g, "\n")
            .replace(/;\r\n/g, "\r\n")
            .replace(/;$/g, "")
            .replace(/\s/g, "");
    }

    testCases.forEach((testCase) => {
        let relativePath = path.relative(conformancePath, testCase);
        if (skipped.indexOf(relativePath) != -1) return;

        it(relativePath, () => {
            let result = new analyzer.AnalyzerHost([testCase]).analyze(testCase, true);
            result.markDirty(true);
            let expected = cleanFace(fs.readFileSync(testCase).toString());
            let got = cleanFace(result.toString());
            let fileSubstitutions = substitutions[relativePath] || {};
            for (var substitution in fileSubstitutions) {
                expected = expected.split(substitution).join(fileSubstitutions[substitution]);
            }

            for (let i = 0; i < Math.max(expected.length, got.length); ++i) {
                if (expected[i] != got[i]) {
                    assert.equal(got.substring(i - 20, i + 20), expected.substring(i - 20, i + 20));
                }
            }
            assert.equal(got, expected);
        });
    })
});
