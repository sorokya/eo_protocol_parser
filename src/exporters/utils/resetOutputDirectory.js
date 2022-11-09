const fs = require('fs');

function resetOutputDirectory(outputDirectory, language) {
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory);
    }

    if (fs.existsSync(`${outputDirectory}/${language}`)) {
        fs.rmdirSync(`${outputDirectory}/${language}`, { recursive: true });
    }

    fs.mkdirSync(`${outputDirectory}/${language}`);
}

module.exports = resetOutputDirectory;
