function isPrimitive(type) {
    return [
      "byte",
      "char",
      "short",
      "three",
      "int",
      "break",
      "string",
      "raw_string",
    ].includes(type);
}

module.exports = isPrimitive;
