const fs = require('fs');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const {parse} = require('./index');

function resetOutputDirectory(outputDirectory, language) {
  if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory);
  }

  if (fs.existsSync(`${outputDirectory}/${language}`)) {
      fs.rmSync(`${outputDirectory}/${language}`, { recursive: true });
  }

  fs.mkdirSync(`${outputDirectory}/${language}`);
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

    let pubSource = fs.readFileSync('protocol/pub.txt', {
        encoding: 'utf8'
    });

    console.info('Parsing done! ✨');

    const outputDirectory = 'output';

    console.info('Generating code... 🤖');
    exportCode({language, protocolSource, pubSource, outputDirectory}).then(() => {
      console.info('Done! 🎉');
    });
  })
  .option('vult-packets', {
    description: 'use official packet names from vult-r',
    alias: 'v',
    type: 'boolean',
    default: false
  })
  .parse();

  function getLanguageExtension(language) {
    switch (language) {
      case 'rust':
        return 'rs';
      case 'javascript':
        return 'js';
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
  }

  async function exportCode({language, protocolSource, pubSource, outputDirectory}) {
    resetOutputDirectory(outputDirectory, language);

    const {protocol, pub} = parse({protocolSource, pubSource, language});

    const extension = getLanguageExtension(language);

    if (protocol) {
        fs.writeFileSync(`${outputDirectory}/${language}/protocol.${extension}`, protocol);
    }

    if (pub) {
        fs.writeFileSync(`${outputDirectory}/${language}/pub.${extension}`, pub);
    }
  }