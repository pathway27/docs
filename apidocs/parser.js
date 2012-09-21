

(function () {

  var expecting = Parser.expecting;

  var list = Parsers.list;
  var node = Parsers.node;
  var seq = Parsers.seq;
  var opt = Parsers.opt;
  var or = Parsers.or;

  // source is the doc comment between the /** and */
  DocCommentParser = function (source) {
    this.source = source;
    this.pos = 0;
  };

  DocCommentParser.prototype._describeLocation = function (pos) {
    var prefix = this.source.slice(0, pos);
    var offsetInLine = prefix.length - prefix.lastIndexOf('\n') - 1;
    var lineNum = (prefix.match(/\n/g) || []).length;
    return "line " + lineNum + ", offset " + offsetInLine;
  };

  DocCommentParser.prototype.getParseError = function (expecting, found) {
    var msg = (expecting ? "Expected " + expecting : "Unexpected text");
    msg += " at " + this._describeLocation(this.pos);
    if (! found) {
      // no "found" text provided; generate some.  May be empty.
      found = ParseNode.stringify(
        this.source.slice(this.pos).match(/^\S+|\s+|$/)[0]);
    }
    msg += ", found " + found;
    return new Error(msg);
  };

  var regex = function (r) {
    var flags = 'g' + (r.ignoreCase ? 'i' : '') + (r.multiline ? 'm' : '');
    r = new RegExp(r.source, flags);
    // simulate "sticky" regular expression that only matches
    // at the current position.  We want /a/, for example, to test
    // whether the *next* character is an 'a', not any subsequent
    // character.  So the regex has to succeed no matter what,
    // but we treat the [\s\S] (any character) case as failure.
    // We detect this case using paren groups 1 and 2.
    var rSticky = new RegExp("((" + r.source + ")|[\\S\\s])", flags);
    return new Parser(
      '/' + r.source + '/',
      function (t) {
        var result;
        var pos = t.pos;
        var source = t.source;
        if (pos === source.length) {
          // At end, no stickiness needed.  See if
          // original regex is happy here.
          r.lastIndex = pos;
          result = r.exec(source) ? [] : null;
        } else {
          rSticky.lastIndex = pos;
          var match = rSticky.exec(source); // always matches
          if (match[2])
            // matched a non-empty string
            result = match[2];
          else if (match[1])
            // failed; hit the [\S\s] case
            result = null;
          else
            // succeeded with empty match;
            // map this to [] to return a truthy value
            result = [];
        }
        if (typeof result === "string")
          t.pos += result.length;
        return result;
      });
  };

  var whitespace = expecting('whitespace', regex(/\s+/));
  var whitespaceInLine = expecting('whitespace', regex(/[^\S\n]/));
  // Whitespace without a paragraph break can only have one newline.
  // There must be at least one whitespace character, and we must
  // be able to see the next non-whitespace character that proves
  // this is not a paragraph break.
  var whitespaceInPara = expecting(
    'whitespace',
    regex(/(?=\s)[^\S\n]*(\n[^\S\n]*)?(?=\S)/));
  var newline = expecting('newline', regex(/\n/));
  // "paragraph break" is a newline followed by one or more blank lines,
  // where a blank line may have whitespace.  End of string is as good
  // as a newline.  Trailing and leading whitespace is included.
  var paraBreak = expecting(
    'end of paragraph',
    regex(/[^\S\n]*($|\n)([^\S\n]*($|\n))+[^\S\n]*/));

  DocCommentParser.prototype.getTree = function () {
//    var signature =
//          node('syntax', seq(whitespace,
//                             node('name', regex(/[^\s\(]+/))));

    //var comment = node('comment', seq(signature, opt(whitespace),
    //expecting('block', blockBreak())));

    // Toy parser, parse "paragraphs" consisting of "words" (\w+).

    var word = expecting('word', regex(/\w+/));
    var paragraph = node(
      'paragraph', list(word, whitespaceInPara));
    var comment = node(
      'comment',
      seq(whitespace,
          opt(list(seq(paragraph, paraBreak))),
          expecting('paragraph', paraBreak)));

    return comment.parseRequired(this);
  };

})();