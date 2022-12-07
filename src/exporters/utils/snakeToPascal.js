function snakeToPascal (string) {
    return string.replace(/(\_\w)/g, function(m){return m[1].toUpperCase();});
}

module.exports = snakeToPascal;
