


var processDocComment = function (input) {
  var docComment = input.match(/\/\*\*([\s\S]*?)(\*\/|$)/);
  if (! docComment)
    return "<p>No doc comment found.</p>";

  // string between the /** and the */
  var content = docComment[1];

  try {
//    return Handlebars._escape(
//      ParseNode.stringify(new DocCommentParser(content).getTree()));
    return processMarkup(content);
  } catch (e) {
    return Handlebars._escape(e.message);
  }

  ////////// OLD

  _.each(content.split('\n'), function (line) {
    if (! curBlockType) {
      if (! isWhitespace(line)) {
        curBlockType = inferBlockType(line);
        blocks.push(line);
      }
    } else if (curBlockType === 'paragraph') {
      if (isWhitespace(line)) {
        // end a paragraph
        curBlockType = null;
      } else {
        // continue a paragraph
        blocks[blocks.length - 1] += '\n' + line;
      }
    } else if (curBlockType === 'arguments') {
      if (/^\s*-/.test(line)) {
        // continue an args list
        // XXX we should also allow wrapped lines and skipped lines
        blocks[blocks.length - 1] += '\n' + line;
      } else {
        // end an args list
        curBlockType = null;
      }
    } else if (curBlockType === 'example') {
      // XXX this is weird
      if (/^```/.test(line)) {
        var firstOne = ! /\n/.test(blocks[blocks.length - 1]);
        blocks[blocks.length - 1] += '\n' + line;
        if (! firstOne)
          curBlockType = null;
      } else {
        blocks[blocks.length - 1] += '\n' + line;
      }
    }
  });

  var sigBlock = blocks.shift();
  var sigParts = sigBlock.match(/^\s*(\S[\s\S]*?)(?=\s*\[|\s*$)\s*(?:\[(.*?)\])?/);
  var sig = sigParts[1];
  var locus = sigParts[2];
  var html = '<div class="sig">' + Handlebars._escape(sig) + '<div class="locus">' +
        Handlebars._escape(locus) + '</div></div>';

  // XXX hack
  var processInlines = function (str) {
    // XXX escaping
    return str.replace(/`.*?`/g, function (s) {
      return '<code>' + s.slice(1, -1) + '</code>';
    });
  };

  html += _.map(blocks, function (block) {
    switch (inferBlockType(block)) {
    case 'arguments':
      return '<p>Arguments</p>' + _.map(block.split('\n').slice(1), function (arg) {
        var argParts = arg.match(/^\s*-\s*(\S+)\s*\((.+?)\)\s*:\s*(.*)/);
        return '<div class="arg">' + '<span class="argname">' + argParts[1] +
          '</span><span class="argtype">' + argParts[2] + '</span></div>' +
          '<div class="argdescr">' + processInlines(argParts[3]) + '</div>';
      }).join('\n');
    case 'paragraph':
    case 'example':
      return '<p>' + processInlines(block) + '</p>';
    }
  }).join('\n');

  return html;
};

var scanMarkupLines = function (input) {
  // Break input into lines and coallesce multi-line structures.
  // These include code fences, which have their own delimiters,
  // paragraphs, and bullets.
  // The whitespace at the start of each line is set aside for
  // inspection at subsequent steps.  Blockquote markers ('>')
  // are considered part of the whitespace.  Together they
  // make up the "indent" property of the line data.
  var lines = input.split('\n');
  var lineData = [];
  var lastLineDatum = null;
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    var indent = line.match(/^\s*(>\s*)*/)[0];
    var rest = line.slice(indent.length);
    var indicatorMatch = rest.match(
        /^(?:[*\-](?= )|#|<(?=[^>]*>$)|```|(.)?)/m);
    var indicator = indicatorMatch[1] ? 'a' : indicatorMatch[0];
    var data = { indent: indent,
                 rest: rest,
                 indicator: indicator };
    i++;
    if (indicator === "```") {
      // code fence.  gobble up all succeeding lines
      // until the closing fence.
      var closed = false;
      while (i < lines.length && ! closed) {
        line = lines[i];
        data.rest += '\n' + line;
        if (/^\s*```/.test(line))
          closed = true;
        i++;
      }
      // XXX generate a warning for this?
      //if (! closed)
      //throw new Error("Unclosed ``` fence");
    } else if (indicator === 'a' && lastLineDatum) {
      if (/^[a*\-]/.test(lastLineDatum.indicator)) {
        // previous lineDatum can be continued.
        // exclude whitespace (and '>')
        lastLineDatum.rest += '\n' + rest;
        // don't add a new lineDatum
        continue;
      }
    }

    lastLineDatum = data;
    lineData.push(data);
  }

  return lineData;
};

var processMarkup = function (input) {
  var lineData = scanMarkupLines(input);

  // Process blockquotes based on varying levels of quoting.
  // Code fences.
  // Block tags.
  // Headings.
  // Bullets with nesting.

  var types = {
    'a': 'PARAGRAPH',
    '*': 'BULLET',
    '-': 'BULLET',
    '#': 'HEADING',
    '```': 'FENCE',
    '<': 'SINGLETAG',
    '': 'BLANK'
  };

  return _.map(lineData, function (data) {
    var spaces = data.indent.match(/^\s*/)[0].length;
    var quotes = data.indent.replace(/[^>]+/g, '');
    return Handlebars._escape("(" + spaces +
                              "," + quotes +
                              "," + types[data.indicator] +
                              ") " + data.rest);
  }).join('<br>');
};

if (Meteor.is_client) {
  Meteor.startup(function () {
    if (! Session.get("input"))
      Session.set("input", "/**\n  Hello\n*/");
  });

  Template.page.input = function () {
    return Session.get("input") || '';
  };

  Template.page.output = function () {
    var input = Session.get("input") || "";

    var html;
    try {
      html = processDocComment(input);
    } catch (e) {
    // XXX
      html = 'ERROR';
    }

    return new Handlebars.SafeString(html);
  };

  Template.page.events({
    'keyup #inputarea textarea': function (event) {
      var input = event.currentTarget.value;
      Session.set("input", input);
    }
  });

  Template.page.preserve(['#inputarea textarea']);

}
