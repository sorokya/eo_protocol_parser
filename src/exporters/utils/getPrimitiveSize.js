function getPrimitiveSize(type) {
  switch (type) {
    case "byte":
    case "char":
      return 1;
    case "short":
      return 2;
    case "three":
      return 3;
    case "int":
      return 4;
    default:
      throw new Error(`Primitive type not handled: ${type}`);
  }
}

module.exports = getPrimitiveSize;
