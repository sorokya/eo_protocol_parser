const lexer = require("./lexer");
const parser = require("./parser");
const strip = require("./strip");
const Exporters = require("./exporters");

function parseInput(text) {
  if (!text) {
    return;
  }

  const lexingResult = lexer.lex(text);
  parser.input = lexingResult.tokens;
  const cst = parser.protocol();

  if (parser.errors.length > 0) {
    throw new Error(parser.errors);
  }

  return strip(cst);
}

function parse({
  protocolSource,
  pubSource,
  vultPackets = false,
  language = "rust",
  crateName = "eo",
}) {
  const protocol = parseInput(protocolSource);
  const pub = parseInput(pubSource);

  switch (language) {
    case "rust":
      const rustExporter = new Exporters.RustExporter({
        protocol,
        pub,
        vultPackets,
        crateName,
      });
      return rustExporter.export();
    case "javascript":
      const javascriptExporter = new Exporters.JavascriptExporter({
        protocol,
        pub,
        vultPackets,
      });
      return javascriptExporter.export();
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

module.exports = { parse };
