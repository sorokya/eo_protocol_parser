const fs = require('fs');

function resetOutputDirectory(outputDirectory, language) {
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdir(outputDirectory);
    }

    if (fs.existsSync(`${outputDirectory}/${language}`)) {
        fs.rmSync(`${outputDirectory}/${language}`, { recursive: true });
    }

    fs.mkdirSync(`${outputDirectory}/${language}`);
}

module.exports = resetOutputDirectory;
