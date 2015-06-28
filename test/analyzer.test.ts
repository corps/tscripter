import { analyzer, statements } from "../index";
import assert = require("assert");
import fs = require("fs");

// Convenience for local testing.
var autoUpdateData = false;

var host: analyzer.AnalyzerHost;
var sourceFiles: string[] = [];
function withSourceFiles(files: string[]) {
  var oldFiles: string[];
  before(() => {
    oldFiles = files;
    sourceFiles = files;
  });
  after(() => { sourceFiles = oldFiles; })
}

var source: statements.Source;

function processFixtures(fixtureName: string) {
  withSourceFiles(["test/fixtures/" + fixtureName + "/index.ts", "test/fixtures/" + fixtureName + "/rewritten.ts"]);

  describe("with recursive=false", () => {
    beforeEach(() => {
      source = host.analyze(sourceFiles[0]);
    });

    it("does not analyze the body of AbstractBlocks until calling analyzeBlock, and eventually analyzes itself correctly.",
      () => {
        source.walkChildren((c) => {
          if (c instanceof statements.AbstractBlock) {
            assert.equal(c.elements.length, 0,
              "Block of type " + (<any>c)["constructor"]["name"] + " had statements before analyzeBlock was called");
            assert.ok(c.canAnalyzeBody(),
              "Block of type " + (<any>c)["constructor"]["name"] + " was not ready for analyzsis.");

            host.getAnalyzer(source, false).analyzeBody(c);
            var length = c.elements.length;

            host.getAnalyzer(source, false).analyzeBody(c);
            assert.equal(c.elements.length, length,
              "Block of type " + (<any>c)["constructor"]["name"] + " did not execute its analysis idempotently!");
          }
        });

        var result = source.toJSON();
        var expected = JSON.parse(fs.readFileSync(sourceFiles[0].replace(".ts", ".json")).toString())
        assert.deepEqual(result, expected);
      });
  });

  describe("with recursive=true", () => {
    beforeEach(() => {
      source = host.analyze(sourceFiles[0], true);
    });

    it(fixtureName + " has each statements's text set.", () => {
      source.walkChildren((c) => {
        if (!(c instanceof statements.Spacing)) {
          assert.notEqual(c.text, null, "Child " + (<any>c)["constructor"]["name"] + " did not have text set.");
        }
      });
      assert.deepEqual(source.toString().split("\n"), fs.readFileSync(source.fileName).toString().split("\n"));
    });

    it(fixtureName + " has each statements's node set, in ascending order of starts", () => {
      source.walkChildren((c) => {
        if (!(c instanceof statements.Spacing)) {
          assert.notEqual(c.node, null, "Child " + (<any>c)["constructor"]["name"] + " did not have node set.");
        }
      });
    });

    it(fixtureName + " has each statement's children returned in getChildren()", () => {
      var seenChildren: any[] = [];
      source.walkChildren((c) => {
        assert.equal(seenChildren.indexOf(c), -1, "Same child appeared twice " + JSON.stringify(c.toJSON()));

        seenChildren.push(c);
        for (var k in c) {
          var val = (<any>c)[k];

          function checkVal(val: any) {
            if (val instanceof statements.CodeNode) {
              assert.ok(c.getChildren().indexOf(val) != -1,
                k + " of type " + (<any>val)["constructor"]["name"] + " was not found in child of " + (<any>c)["constructor"]["name"]);
            } else if (val instanceof Array) {
              val.forEach((v: any) => { checkVal(v); });
            }
          }

          checkVal(val);
        }
      })
    });

    it(fixtureName + " can rewrite itself from scratch.", () => {
      source.markDirty(true);
      var result = source.toString();
      fs.writeFileSync(sourceFiles[1].replace(".ts", ".out.ts"), result);

      if (autoUpdateData)
        fs.writeFileSync(sourceFiles[1], result);

      assert.deepEqual(result.split("\n"),
        host.program.getSourceFile(sourceFiles[1]).getFullText(host.program.getSourceFile(sourceFiles[1])).split("\n"));
    });

    it(fixtureName + " analyzes each child correctly.", () => {

      source.markDirty(true);
      var result = source.toJSON();

      fs.writeFileSync(sourceFiles[0].replace(".ts", ".out.json"), JSON.stringify(result, null, 2));

      if (autoUpdateData)
        fs.writeFileSync(sourceFiles[0].replace(".ts", ".json"), JSON.stringify(result, null, 2));

      var expected = JSON.parse(fs.readFileSync(sourceFiles[0].replace(".ts", ".json")).toString())
      assert.deepEqual(result, expected);
    });
  })
}

describe("AnalyzerHost", function () {
  beforeEach(() => { analyzer.strictMode = true; });

  beforeEach(() => {
    host = new analyzer.AnalyzerHost(sourceFiles);
  });

  describe("#analyze", () => {
    withSourceFiles(["test/fixtures/modules/index.ts"]);

    describe("analyzing an unexpected statement", () => {
      var sourceAnalyzer: analyzer.SourceAnalyzer;
      var source: statements.Source;
      beforeEach(() => {
        source = new statements.Source("filename");
        sourceAnalyzer = new analyzer.SourceAnalyzer(host, source, <any>{
          statements: [
            {
              kind: -100,
              getText: () => "statementText",
              getFullText: () => "statementText",
              getStart: () => 0,
              getFullStart: () => 0
            }
          ],
          getFullText: () => "sourceText"
        }, true);
      });

      describe("with strictMode enabled", () => {
        beforeEach(() => { analyzer.strictMode = true; });

        it("fails to analyze", () => {
          assert.throws(() => {
            sourceAnalyzer.analyze();
          })
        })
      });
      describe("with strictMode disabled", () => {
        beforeEach(() => { analyzer.strictMode = false; });

        it("falls back to a CodeNode with text / node content", () => {
          sourceAnalyzer.analyze();
          assert.equal(source.elements.length, 1);
          assert.equal(source.elements[0].constructor, statements.CodeNode);
          assert.equal(source.elements[0].text, "statementText");
          assert.equal(source.elements[0].node.kind, -100);
        });
      });
    });

    it("returns the same instance for the same file", () => {
      assert.equal(host.analyze(sourceFiles[0]), host.analyze(sourceFiles[0]));
    });

    it("does not reanalyze a file multiple times", () => {
      // Ensure that a secondary run does not alter the global Source object multiple times.  This would result in
      // a longer string on the second run.
      assert.equal(host.analyze(sourceFiles[0]).toString(), host.analyze(sourceFiles[0]).toString());
    });
  });

  describe("expressions", () => {
    processFixtures("expressions");
  });

  describe("statements", () => {
    processFixtures("statements");
  });

  describe("types", () => {
    processFixtures("types");
  });

  describe("modules", () => {
    processFixtures("modules");
  });
});
