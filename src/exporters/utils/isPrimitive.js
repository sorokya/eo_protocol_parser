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
      "prefix_string",
      "emf_string",
    ].includes(type);
}

module.exports = isPrimitive;
