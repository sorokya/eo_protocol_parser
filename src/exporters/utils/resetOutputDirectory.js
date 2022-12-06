const fs = require('fs');

async function resetOutputDirectory(outputDirectory, language) {
    if (!fs.existsSync(outputDirectory)) {
        await fs.promises.mkdir(outputDirectory);
    }

    if (fs.existsSync(`${outputDirectory}/${language}`)) {
        await fs.promises.rmdir(`${outputDirectory}/${language}`, { recursive: true });
    }

    await fs.promises.mkdir(`${outputDirectory}/${language}`);
}

module.exports = resetOutputDirectory;
