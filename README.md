# tscripter
`tscripter` is a library for producing and analyzing [`typescript`](https://github.com/Microsoft/TypeScript) code.  Unlike the traditional AST provided by typescript's language services, `tscripter` produces a syntax tree whose structure can be slice, moved, duplicated, tweaked and then re-rendered, allowing for simpler programatic transformation of existing code.  Basically, **tscripter is for code generators**.

## Quick Start

TODO.  Will include an examples doc.

## Overview

`tscripter` produces its AST tree in two ways: either via the `AnalyzerHost` which analyzes existing sources, or programmatically through the construction of `statements.CodeNode` objects.  

The ultimate use case is a mix match of both -- analyzing existing code, and then altering or adding to the the produced `statements.CodeNode` objects.  Although `tscripter` provides an abstraction for rewriting code, it also provides access to the original code text and `typescript.Node` objects, giving you the ability to leverage other `typescript` language services on `tscripter`'s AST and to preserve any formatting of code you do not alter.

`tscripter` attempts to handle large files by performing its analysis and rendering *lazily*.  Any block object, such as function bodies or class definitions, will only be analyzed when requested to do so, allowing you to pinpoint the structures you want to alter during code generation.  Furthermore, new strings are only created for code objects specifically marked for re-rendering, allowing a large file to be re-rendered with only the new string segments being recomposed.

## Caveats

`tscripter` differs from the traditional AST by modeling "code trivia" such as comments and whitespace as its own element, rather than attributes of existing elements.  This makes certain kinds of formatting simpler, but for simplicity sake `tscripter` assumes some common formatting rules and does not allow the generation of comments or spacing in certain parts of the syntax tree normally allowed, however this is mostly the exception.  Some examples where `tscripter` will not render comments or spacing:

* Inside of template string interpolation expressions, eg

```
${
  // this cannot be written via tscripter
  1 + 1;
}
```

* Between property name declarations and their typings
```
var b // this also cannot be written via tscripter
  : string = "hello!";
```

However, `tscripter` **will properly preserve** this kind of formatting in existing code that is not altered.  


## Support

`tscripter` supports all syntax in typescript `1.5.0-beta`, passing all conformance related spec files in the `typescript` codebase itself.  There may, once again, be some edge cases where the formatting of `tscripter` will differ, but it will still produce valid code and preserve existing formatting when possible.
