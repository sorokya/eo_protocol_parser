const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const lexer = require('./lexer');
const parser = require('./parser');
const strip = require('./strip');
const exporters = require('./exporters');

function parseInput(text) {
    const lexingResult = lexer.lex(text);
    parser.input = lexingResult.tokens;
    const cst = parser.protocol();

    if (parser.errors.length > 0) {
      throw new Error(parser.errors);
  }

    return strip(cst);
}

yargs(hideBin(process.argv))
  .command('export [language]', 'parses the protocol files and exports code', (yargs) => {
    return yargs
      .positional('language', {
        describe: 'language to export (currently only "rust" is supported)',
        default: 'rust'
      })
  }, (argv) => {
    const {language} = argv;

    console.info('Parsing protocol files... ⏳');

    let protocolSource = fs.readFileSync('protocol/eo.txt', {
        encoding: 'utf8'
    });

    const protocol = parseInput(protocolSource);
    console.info('Parsing done! ✨');

    const outputDirectory = 'output';

    console.info('Generating code... 🤖');
    switch (language) {
      case 'rust':
        exporters.rust(protocol, outputDirectory);
        break;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  })
  .option('vult-packets', {
    description: 'use official packet names from vult-r',
    alias: 'v',
    type: 'boolean',
    default: false
  })
  .parse();




