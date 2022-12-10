const {
  isPrimitive,
  snakeToPascal,
  removeUnderscores,
} = require("./utils");

const reserved = [
  "abstract",
  "arguments",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield",
];

class Exporter {
  constructor({ protocol, pub }) {
    this.protocol = protocol;
    this.pub = pub;
    this.pubOutput = "";
    this.protocolOutput = "";
  }

  export() {
    this.exportProtocol();
    this.exportPub();

    return { pub: this.pubOutput, protocol: this.protocolOutput };
  }

  exportProtocol() {
    this.outputType = "protocol";
    this.appendWarning();
    this.append("\n");

    this.exportEnums();
    this.exportStructs();
    this.exportPackets();
    this.appendWarning();
  }

  exportPub() {
    this.output = "";
    this.outputType = "pub";
    this.appendWarning();
    this.append("\n");

    this.exportEnums();
    this.exportStructs();
  }

  exportEnums() {
    for (const { comment, name, variants } of this[this.outputType].enums) {
      const enumIdentifier = this.getIdentifierName(name);

      if (comment) {
        this.printDocComment(comment);
      }

      this.append(`protocol.${enumIdentifier} = {\n`);

      for (const [enumValue, enumName] of Object.entries(variants)) {
        this.append(`    ${removeUnderscores(enumName)}: ${enumValue === '_' ? 'undefined' : enumValue},\n`);
      }

      this.append("}\n\n");
    }
  }

  exportStructs() {
    for (const struct of this[this.outputType].structs) {
      this.exportStruct(struct);
    }
  }

  exportPackets() {
    for (const who of ["Client", "Server"]) {
      const families = new Set();
      for (const packet of this.protocol[`${who.toLowerCase()}Packets`]) {
        families.add(packet.family);
      }
      const sortedFamilies = Array.from(families).sort((a, b) => a - b);

      for (const family of sortedFamilies) {
        const packets = this.protocol[`${who.toLowerCase()}Packets`]
          .filter((p) => p.family === family)
          .sort((a, b) => a.action - b.action);
        for (const packet of packets) {
          this.exportStruct({
            ...packet,
            name: `${who}${family}${packet.action}`,
          });
        }
      }
    }
  }

  exportStruct({ comment, name, fields }, indents = 0) {
    const structIdentifier = this.getIdentifierName(name);
    const indentation = "    ".repeat(indents);

    if (comment) {
      this.printDocComment(comment, indents);
    }

    this.append(`${indentation}module.${structIdentifier} = class ${structIdentifier} {\n`);
    this.append(`${indentation}    constructor() {\n`);
    if (fields && fields.length > 0) {
      const typesWithoutBreaks = fields.filter((field) => {
        return field !== "BREAK";
      });
      for (const field of typesWithoutBreaks) {
        const { name: originalName, type, isArray, arrayLength } = field;
        const name = !!originalName ? this.getVariableName(originalName) : "";
        const defaultValue = this.getDefaultValue(field);

        if (name) {
          this.append(
            `${indentation}        this.${name} = ${defaultValue};\n`
          );
        } else {
          if (type === "union") {
            this.append(`${indentation}        this.data = null;\n`);
          }
        }
      }
    }
    this.append(`${indentation}    }\n\n`);
    this.append(`${indentation}    deserialize(reader) {\n`);
    if (fields && fields.length > 0) {
      for (const field of fields) {
        const {
          name: originalName,
          type,
          fixedLength,
          fixedLengthOperator,
          fixedLengthOffset,
          isArray,
          arrayLength,
          value,
        } = field;

        const name = originalName ? this.getVariableName(originalName) : "";

        const isEnum =
          field !== "BREAK" &&
          !isPrimitive(type) &&
          type !== "struct" &&
          type !== "union" &&
          type !== "sub_string";
        const matchingEnum =
          isEnum && this[this.outputType].enums.find((e) => e.name === type);
        if (isEnum && !matchingEnum) {
          throw new Error(`Could not find matching enum: ${type}`);
        }

        switch (true) {
          case isArray:
            if (typeof arrayLength === "number") {
              this.append(
                `${indentation}        for (let i = 0; i < ${arrayLength}; ++i) {\n`
              );
              switch (true) {
                case type === "string":
                  this.append(
                    `${indentation}          this.${name}[i] = reader.geBreakString();\n`
                  );
                  break;
                case type === "struct":
                  this.append(
                    `${indentation}          this.${name}[i].deserialize(reader);\n`
                  );
                  break;
                default:
                  this.append(
                    `${indentation}          this.${name}[i] = reader.get${
                      type.substr(0, 1).toUpperCase() + type.substr(1)
                    }();\n`
                  );
                  break;
              }
              this.append(`${indentation}        }\n`);
            } else if (arrayLength) {
              this.append(
                `${indentation}        for (let i = 0; i < ${arrayLength}; ++i) {\n`
              );
              switch (true) {
                case type === "string":
                  this.append(
                    `${indentation}          this.${name}.push(reader.getBreakString());\n`
                  );
                  break;
                case type === "struct":
                  this.append(
                    `${indentation}          const ${this.getVariableName(
                      field.struct
                    )} = new ${removeUnderscores(field.struct)}();\n`
                  );
                  this.append(
                    `${indentation}          ${this.getVariableName(
                      field.struct
                    )}.deserialize(reader);\n`
                  );
                  this.append(
                    `${indentation}          this.${name}.push(${this.getVariableName(
                      field.struct
                    )});\n`
                  );
                  break;
                default:
                  this.append(
                    `${indentation}          this.${name}.push(reader.get${
                      type.substr(0, 1).toUpperCase() + type.substr(1)
                    }());\n`
                  );
                  break;
              }
              this.append(`${indentation}        }\n`);
            } else {
              // read till break or EOF
              // TODO: optimize for large packets (files)
              this.append(
                `${indentation}        while(!reader.eof() && reader.peekByte() != 0xFF) {\n`
              );
              switch (true) {
                case type === "string":
                  this.append(
                    `${indentation}          this.${name}.push(reader.getBreakString());\n`
                  );
                  break;
                case type === "struct":
                  this.append(
                    `${indentation}          const ${this.getVariableName(
                      field.struct
                    )} = new ${this.getIdentifierName(field.struct)}();\n`
                  );
                  this.append(
                    `${indentation}          ${this.getVariableName(
                      field.struct
                    )}.deserialize(reader);\n`
                  );
                  this.append(
                    `${indentation}          this.${name}.push(${this.getVariableName(
                      field.struct
                    )});\n`
                  );
                  break;
                default:
                  this.append(
                    `${indentation}          this.${name}.push(reader.get${
                      type.substr(0, 1).toUpperCase() + type.substr(1)
                    }());\n`
                  );
                  break;
              }
              this.append(`${indentation}        }\n`);
            }
            break;
          case !!value:
            this.append(
              `${indentation}        reader.get${
                type.substr(0, 1).toUpperCase() + type.substr(1)
              }();\n`
            );
            break;
          case isEnum:
            this.append(
              `${indentation}        this.${name} = reader.get${
                matchingEnum.dataType.substr(0, 1).toUpperCase() +
                matchingEnum.dataType.substr(1)
              }();\n`
            );
            break;
          case type === "string":
            this.append(
              `${indentation}        this.${name} = reader.getBreakString();\n`
            );
            break;
          case type === "prefix_string":
            this.append(
              `${indentation}        this.${name} = reader.getPrefixString();\n`
            );
            break;
          case type === "raw_string":
            if (fixedLength) {
              this.append(
                `${indentation}        this.${name} = reader.getFixedString(${
                  isNaN(fixedLength) ? `this.${fixedLength}` : fixedLength
                }`
              );

              if (fixedLengthOperator) {
                this.append(` ${fixedLengthOperator} `);
                if (isNaN(fixedLengthOffset)) {
                  this.append(`this.${fixedLengthOffset}`);
                } else {
                  this.append(`${fixedLengthOffset}`);
                }
              }

              this.append(");\n");
            } else {
              this.append(
                `${indentation}        this.${name} = reader.getEndString();\n`
              );
            }
            break;
          case type === "emf_string":
            this.append(
              `${indentation}        this.${name} = reader.getEmfString(${
                isNaN(fixedLength) ? `this.${fixedLength}` : fixedLength
              });\n`
            );
            break;
          case field === "BREAK":
            this.append(`${indentation}        reader.getByte();\n`);
            break;
          case type === "struct":
            this.append(
              `${indentation}        this.${name}.deserialize(reader);\n`
            );
            break;
          case type === "union":
            const { type: unionVariableType } = fields.find(
              (f) => f.name === field.variable
            );
            this.append(
              `${indentation}        switch(this.${this.getVariableName(
                field.variable
              )}) {\n`
            );
            field.cases.forEach((unionCase) => {
              this.append(
                `${indentation}          case ${unionVariableType}.${removeUnderscores(
                  unionCase.type
                )}:\n`
              );
              this.append(
                `${indentation}              this.data = new ${structIdentifier}${this.getIdentifierName(
                  unionCase.type
                )}();\n`
              );
              this.append(
                `${indentation}              this.data.deserialize(reader);\n`
              );
              this.append(`${indentation}              break;\n`);
            });
            this.append(`${indentation}        }\n`);
            break;
          case type === "sub_string":
            const { string, start, length } = field;
            const skip = isNaN(start) ? `this.${start}` : start;
            const take = isNaN(length) ? `this.${length}` : length;
            this.append(
              `${indentation}        this.${name} = this.${string}.substr(${skip}, ${take});\n`
            );
            break;
          default:
            this.append(
              `${indentation}        this.${name} = reader.get${
                type.substr(0, 1).toUpperCase() + type.substr(1)
              }();\n`
            );
            break;
        }
      }
    }
    this.append(`${indentation}    }\n`);
    this.append(`${indentation}    serialize() {\n`);
    this.append(`${indentation}        const builder = new Builder();\n`);
    if (fields && fields.length > 0) {
      for (const field of fields) {
        const { name: originalName, type, fixedLength, isArray, value } = field;
        const name = originalName
          ? this.getVariableName(originalName)
          : originalName;

        const isEnum =
          field !== "BREAK" &&
          !isPrimitive(type) &&
          type !== "struct" &&
          type !== "union" &&
          type !== "sub_string";
        const matchingEnum =
          isEnum && this[this.outputType].enums.find((e) => e.name === type);
        if (isEnum && !matchingEnum) {
          throw new Error(`Could not find matching enum: ${type}`);
        }

        switch (true) {
          case isArray:
            this.append(
              `${indentation}        for (let i = 0; i < this.${name}.length; ++i) {\n`
            );
            switch (true) {
              case type === "string":
                this.append(
                  `${indentation}          builder.addBreakString(this.${name}[i]);\n`
                );
                break;
              case type === "prefix_string":
                this.append(
                  `${indentation}          builder.addPrefixString(this.${name}[i]);\n`
                );
                break;
              case type === "emf_string":
                this.append(
                  `${indentation}          builder.addEmfString(this.${name}[i]);\n`
                );
                break;
              case type === "struct":
                this.append(
                  `${indentation}          builder.append(this.${name}[i].serialize());\n`
                );
                break;
              default:
                this.append(
                  `${indentation}          builder.add${
                    type.substr(0, 1).toUpperCase() + type.substr(1)
                  }(this.${name}[i]);\n`
                );
                break;
            }
            this.append(`${indentation}        }\n`);
            break;
          case !!value:
            if (isNaN(value)) {
              this.append(
                `${indentation}        builder.add${
                  type.substr(0, 1).toUpperCase() + type.substr(1)
                }(${value}.charCodeAt());\n`
              );
            } else {
              this.append(
                `${indentation}        builder.add${
                  type.substr(0, 1).toUpperCase() + type.substr(1)
                }(${value});\n`
              );
            }
            break;
          case isEnum:
            this.append(
              `${indentation}        builder.add${
                matchingEnum.dataType.substr(0, 1).toUpperCase() +
                matchingEnum.dataType.substr(1)
              }(this.${name});\n`
            );
            break;
          case type === "string":
            this.append(
              `${indentation}        builder.addBreakString(this.${name});\n`
            );
            break;
          case type === "prefix_string":
            this.append(
              `${indentation}        builder.addPrefixString(this.${name});\n`
            );
            break;
          case type === "emf_string":
            this.append(
              `${indentation}        builder.addEmfString(this.${name});\n`
            );
            break;
          case type === "raw_string":
            if (fixedLength) {
              this.append(
                `${indentation}        builder.addFixedString(this.${name}, ${
                  typeof fixedLength === "string"
                    ? `this.${fixedLength}`
                    : fixedLength
                });\n`
              );
            } else {
              this.append(
                `${indentation}        builder.addString(this.${name});\n`
              );
            }
            break;
          case field === "BREAK":
            this.append(`${indentation}        builder.addByte(0xFF);\n`);
            break;
          case type === "struct":
            this.append(
              `${indentation}        builder.append(this.${name}.serialize());\n`
            );
            break;
          case type === "union":
            this.append(`${indentation}        if (this.data) {\n`);
            this.append(
              `${indentation}            builder.append(this.data.serialize());\n`
            );
            this.append(`${indentation}        }\n`);
            break;
          case type === "sub_string":
            // no-op
            break;
          default:
            this.append(
              `${indentation}        builder.add${
                type.substr(0, 1).toUpperCase() + type.substr(1)
              }(this.${name});\n`
            );
            break;
        }
      }
    }
    this.append(`${indentation}        return builder.get();\n`);
    this.append(`${indentation}    }\n`);
    this.append(`${indentation}}\n\n`);

    // // recursively print unions as structs

    function printUnions(_fields) {
      const unions = _fields.filter(({ type }) => type === "union");
      if (unions) {
        for (const union of unions) {
          for (const unionCase of union.cases) {
            this.exportStruct(
              {
                name: `${name}${this.getIdentifierName(unionCase.type)}`,
                fields: unionCase.fields,
              },
              indents
            );
          }
        }
      }
    }

    if (fields && fields.length > 0) {
      printUnions.bind(this)(fields);
    }
  }

  append(string) {
    switch (this.outputType) {
      case "protocol":
        this.protocolOutput += string;
        break;
      case "pub":
        this.pubOutput += string;
        break;
    }
  }

  appendWarning() {
    this.append(
      "// WARNING! This file was generated automatically. Do NOT edit it manually.\n"
    );
    this.append("// https://github.com/sorokya/eo_protocol_parser\n");
  }

  printDocComment(comment, indent = 0) {
    this.append(`${"    ".repeat(indent)}// ${comment}\n`);
  }

  getDefaultValue(field) {
    const { type, value, isArray } = field;

    if (value) {
      return value;
    }

    if (isArray) {
      return "[]";
    }

    switch (type) {
      case "byte":
      case "char":
      case "short":
      case "three":
      case "int":
        return 0;
      case "prefix_string":
      case "string":
      case "raw_string":
        return "''";
      default:
        return 'null';
    }
  }

  getIdentifierName(name) {
    const identifierName = removeUnderscores(name);
    if (reserved.includes(identifierName)) {
      return `R${identifierName}`;
    }
    return identifierName;
  }

  getVariableName(name) {
    let variableName = snakeToPascal(name);
    if (reserved.includes(variableName)) {
      return `r${variableName}`;
    }

    return variableName.substr(0, 1).toLowerCase() + variableName.substr(1);
  }
}

module.exports = { Exporter };
