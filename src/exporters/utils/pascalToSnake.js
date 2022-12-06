function pascalToSnake (string) {
    return string.replace(/\.?([A-Z]+)/g, function (x,y){return "_" + y.toLowerCase()}).replace(/^_/, "").replace(/__/g, '_');
}

module.exports = pascalToSnake;
