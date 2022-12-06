const fs = require("fs");
const {
  getPrimitiveSize,
  isPrimitive,
  pascalToSnake,
  resetOutputDirectory,
  removeUnderscores,
} = require("./utils");

const reserved = [
  "as",
  "break",
  "const",
  "continue",
  "create",
  "else",
  "enum",
  "extern",
  "false",
  "fn",
  "for",
  "if",
  "impl",
  "in",
  "let",
  "loop",
  "match",
  "mod",
  "move",
  "mut",
  "pub",
  "ref",
  "return",
  "self",
  "Self",
  "static",
  "struct",
  "super",
  "trait",
  "true",
  "type",
  "unsafe",
  "use",
  "where",
  "while",
  "async",
  "await",
  "dyn",
];

class Exporter {
  constructor({ protocol, outputDirectory, crateName = "eo" }) {
    this.protocol = protocol;
    this.outputDirectory = outputDirectory;
    this.crateName = crateName === "eo" ? "crate" : "eo";
  }

  async export() {
    await resetOutputDirectory(this.outputDirectory, "rust");
    this.output = fs.createWriteStream(
      `${this.outputDirectory}/rust/protocol.rs`,
      {
        encoding: "utf8",
      }
    );
    this.appendWarning();
    this.output.write("\n");

    this.output.write("use log::warn;\n");
    this.output.write(
      `use ${this.crateName}::data::{EO_BREAK_CHAR, EOByte, EOChar, EOThree, EOInt, EOShort, Serializeable, StreamReader, StreamBuilder};\n\n`
    );

    this.exportEnums();
    this.exportStructs();
    this.exportPackets();
    this.appendWarning();
  }

  exportEnums() {
    for (const { comment, name, dataType, variants } of this.protocol.enums) {
      const size = getPrimitiveSize(dataType);
      const enumIdentifier = this.getIdentifierName(name);

      this.output.write(
        `pub const ${pascalToSnake(enumIdentifier).toUpperCase()}_SIZE: usize = ${size};\n\n`
      );

      if (comment) {
        this.printDocComment(comment);
      }

      this.output.write(`#[derive(Debug, Clone, Copy, PartialEq, Eq)]\n`);
      this.output.write(`pub enum ${enumIdentifier} {\n`);

      for (const [enumValue, enumName] of Object.entries(variants)) {
        const variantIdentifier = this.getIdentifierName(enumName);
        const variantType = this.getTypeName(dataType);

        if (enumValue === "_") {
          this.output.write(`    ${variantIdentifier}(${variantType}),\n`);
        } else {
          this.output.write(`    ${variantIdentifier},\n`);
        }
      }

      this.output.write(`}\n\n`);

      const typeName = this.getTypeName(dataType);
      this.output.write(`impl ${enumIdentifier} {\n`);
      this.output.write(
        `    pub fn from_${dataType}(value: ${typeName}) -> Self {\n`
      );
      this.output.write(`        match value {\n`);

      const variantsExcludingDefault = Object.entries(variants).filter(
        ([value, _]) => value !== "_"
      );
      const defaultVariant = Object.entries(variants).find(
        ([value, _]) => value === "_"
      );
      for (const [enumValue, enumName] of variantsExcludingDefault) {
        this.output.write(
          `            ${enumValue} => Self::${removeUnderscores(enumName)},\n`
        );
      }

      if (defaultVariant) {
        this.output.write(
          `            _ => Self::${removeUnderscores(
            defaultVariant[1]
          )}(value),\n`
        );
      } else {
        this.output.write(`            _ => {\n`);
        this.output.write(
          `                warn!("Invalid value for enum ${name}: {}", value);\n`
        );
        this.output.write(
          `                Self::${removeUnderscores(
            variantsExcludingDefault[0][1]
          )}\n`
        );
        this.output.write(`            },\n`);
      }

      this.output.write(`        }\n`);
      this.output.write(`    }\n\n`);
      this.output.write(`   pub fn to_${dataType}(self) -> ${typeName} {\n`);
      this.output.write(`        match self {\n`);
      for (const [enumValue, enumName] of variantsExcludingDefault) {
        this.output.write(
          `            Self::${removeUnderscores(enumName)} => ${enumValue},\n`
        );
      }
      if (defaultVariant) {
        this.output.write(
          `            Self::${removeUnderscores(
            defaultVariant[1]
          )}(value) => value,\n`
        );
      }
      this.output.write(`        }\n`);
      this.output.write(`    }\n`);
      this.output.write(`}\n\n`);
      this.output.write(`impl Default for ${name} {\n`);
      this.output.write(`    fn default() -> Self {\n`);
      this.output.write(
        `        ${enumIdentifier}::${removeUnderscores(
          Object.entries(variants)[0][1]
        )}\n`
      );
      this.output.write(`    }\n`);
      this.output.write(`}\n\n`);
    }
  }

  exportStructs() {
    for (const struct of this.protocol.structs) {
      this.exportStruct(struct);
    }
  }

  exportPackets() {
    for (const who of ["client", "server"]) {
      this.output.write(`pub mod ${who} {\n`);
      this.output.write(`    use super::*;\n\n`);

      const families = new Set();
      for (const packet of this.protocol[`${who}Packets`]) {
        families.add(packet.family);
      }
      const sortedFamilies = Array.from(families).sort((a, b) => a - b);

      for (const family of sortedFamilies) {
        this.output.write(`    pub mod ${family} {\n`);
        this.output.write(`        use super::super::*;\n\n`);
        const packets = this.protocol[`${who}Packets`].filter((p) => p.family === family).sort((a, b) => a.action - b.action);
        for (const packet of packets) {
          this.exportStruct({
            ...packet,
            name: packet.action,
          }, 2);
        }
        this.output.write('    }\n\n')
      }

      this.output.write('}\n\n');
    }
  }

  exportStruct({ comment, name, fields }, indents = 0) {
    const structIdentifier = this.getIdentifierName(name);
    const indentation = "    ".repeat(indents);

    if (comment) {
      this.printDocComment(comment, indents);
    }

    // Create union enums
    const unionFields = fields?.filter((f) => f.type === "union");
    if (unionFields) {
      for (const unionField of unionFields) {
        this.output.write(
          `${indentation}#[derive(Debug, PartialEq, Eq, Clone)]\npub enum ${structIdentifier}Data {\n`
        );
        for (const unionCase of unionField.cases) {
          const caseName = removeUnderscores(unionCase.type);
          this.output.write(`${indentation}    ${caseName}(${structIdentifier}${caseName}),\n`);
        }
        this.output.write(`${indentation}}\n\n`);

        this.output.write(`${indentation}impl Default for ${structIdentifier}Data {\n`);
        this.output.write(`${indentation}    fn default() -> Self {\n`);
        this.output.write(
          `${indentation}        Self::${removeUnderscores(
            unionField.cases[0].type
          )}(${name}${removeUnderscores(
            unionField.cases[0].type
          )}::default())\n`
        );
        this.output.write(`${indentation}    }\n`);
        this.output.write(`${indentation}}\n\n`);
      }
    }

    this.output.write(`${indentation}#[derive(Debug, Default, Clone, PartialEq, Eq)]\n`);
    this.output.write(`${indentation}pub struct ${structIdentifier} {\n`);

    if (fields && fields.length > 0) {
      const typesWithoutBreaks = fields.filter((field) => {
        return field !== "BREAK";
      });

      for (const field of typesWithoutBreaks) {
        const { name, type, isArray, arrayLength, comment } = field;

        const typeName =
          type === "struct"
            ? removeUnderscores(field.struct)
            : this.getTypeName(type);

        if (comment) {
          this.printDocComment(comment, indents + 1);
        }

        switch (true) {
          case isArray:
            if (typeof arrayLength === "number") {
              this.output.write(`${indentation}    pub ${name}: [${typeName}; ${arrayLength}],\n`);
            } else {
              this.output.write(`${indentation}    pub ${name}: Vec<${typeName}>,\n`);
            }
            break;
          case type === "union":
            this.output.write(`${indentation}    pub data: ${structIdentifier}Data,\n`);
          case !name:
            continue;
          default:
            this.output.write(`${indentation}    pub ${name}: ${typeName},\n`);
            break;
        }
      }
    }

    this.output.write(`${indentation}}\n\n`);

    this.output.write(`${indentation}impl ${structIdentifier} {\n`);
    this.output.write(`${indentation}    pub fn new() -> Self {\n`);
    this.output.write(`${indentation}        Self::default()\n`);
    this.output.write(`${indentation}    }\n`);
    this.output.write(`${indentation}}\n\n`);

    this.output.write(`${indentation}impl Serializeable for ${structIdentifier} {\n`);
    this.output.write(`${indentation}    fn deserialize(&mut self, reader: &StreamReader) {\n`);

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const { name, type, fixedLength, isArray, arrayLength, value } = field;

        const isEnum =
          field !== "BREAK" &&
          !isPrimitive(type) &&
          type !== "struct" &&
          type !== "union" &&
          type !== "function";
        const matchingEnum = isEnum && this.protocol.enums.find((e) => e.name === type);
        if (isEnum && !matchingEnum) {
          throw new Error(`Could not find matching enum: ${type}`);
        }

        switch (true) {
          case isArray:
            if (typeof arrayLength === "number") {
              this.output.write(`${indentation}        for i in 0..${arrayLength} {\n`);
              switch (true) {
                case type === "string":
                  this.output.write(
                    `${indentation}          self.${name}[i] = reader.get_break_string();\n`
                  );
                  break;
                case type === "struct":
                  this.output.write(
                    `${indentation}          self.${name}[i].deserialize(&reader);\n`
                  );
                  break;
                default:
                  this.output.write(
                    `${indentation}          self.${name}[i] = reader.get_${type}();\n`
                  );
                  break;
              }
              this.output.write(`${indentation}        }\n`);
            } else if (arrayLength) {
              this.output.write(`${indentation}        for _ in 0..self.${arrayLength} {\n`);
              switch (true) {
                case type === "string":
                  this.output.write(
                    `${indentation}          self.${name}.push(reader.get_break_string());\n`
                  );
                  break;
                case type === "struct":
                  this.output.write(
                    `${indentation}          let mut ${pascalToSnake(
                      field.struct
                    )} = ${removeUnderscores(field.struct)}::new();\n`
                  );
                  this.output.write(
                    `${indentation}          ${pascalToSnake(
                      field.struct
                    )}.deserialize(&reader);\n`
                  );
                  this.output.write(
                    `${indentation}          self.${name}.push(${pascalToSnake(
                      field.struct
                    )});\n`
                  );
                  break;
                default:
                  this.output.write(
                    `${indentation}          self.${name}.push(reader.get_${type}());\n`
                  );
                  break;
              }
              this.output.write(`${indentation}        }\n`);
            } else {
              // read till break or EOF
              // TODO: optimize for large packets (files)
              this.output.write(
                `${indentation}        while !reader.eof() && reader.peek_byte() != EO_BREAK_CHAR {\n`
              );
              switch (true) {
                case type === "string":
                  this.output.write(
                    `${indentation}          self.${name}.push(reader.get_break_string());\n`
                  );
                  break;
                case type === "struct":
                  this.output.write(
                    `${indentation}          let mut ${pascalToSnake(
                      field.struct
                    )} = ${removeUnderscores(field.struct)}::new();\n`
                  );
                  this.output.write(
                    `${indentation}          ${pascalToSnake(
                      field.struct
                    )}.deserialize(&reader);\n`
                  );
                  this.output.write(
                    `${indentation}          self.${name}.push(${pascalToSnake(
                      field.struct
                    )});\n`
                  );
                  break;
                default:
                  this.output.write(
                    `${indentation}          self.${name}.push(reader.get_${type}());\n`
                  );
                  break;
              }
              this.output.write(`${indentation}        }\n`);
            }
            break;
          case !!value:
            this.output.write(`${indentation}        reader.get_${type}();\n`);
            break;
          case isEnum:
            this.output.write(
              `${indentation}        self.${name} = ${type}::from_${matchingEnum.dataType}(reader.get_${matchingEnum.dataType}());\n`
            );
            break;
          case type === "string":
            this.output.write(`${indentation}        self.${name} = reader.get_break_string();\n`);
            break;
          case type === "raw_string":
            if (fixedLength) {
              this.output.write(
                `${indentation}        self.${name} = reader.get_fixed_string(${
                  typeof fixedLength === "string"
                    ? `self.${fixedLength}`
                    : fixedLength
                } as usize);\n`
              );
            } else {
              this.output.write(`${indentation}        self.${name} = reader.get_end_string();\n`);
            }
            break;
          case field === "BREAK":
            this.output.write(`${indentation}        reader.get_byte();\n`);
            break;
          case type === "struct":
            this.output.write(`${indentation}        self.${name}.deserialize(&reader);\n`);
            break;
          case type === "union":
            this.output.write(`${indentation}        match self.${field.variable} {\n`);
            const { type: unionVariableType } = fields.find(
              (f) => f.name === field.variable
            );
            for (const unionCase of field.cases) {
              const { type: unionCaseType, name: unionCaseName } = unionCase;
              this.output.write(
                `${indentation}            ${unionVariableType}::${removeUnderscores(
                  unionCaseType
                )} => {\n`
              );
              this.output.write(
                `${indentation}                let mut ${unionCaseName} = ${structIdentifier}${removeUnderscores(
                  unionCaseType
                )}::new();\n`
              );
              this.output.write(
                `${indentation}                ${unionCaseName}.deserialize(&reader);\n`
              );
              this.output.write(
                `${indentation}                self.data = ${structIdentifier}Data::${removeUnderscores(
                  unionCaseType
                )}(${unionCaseName});\n`
              );
              this.output.write(`${indentation}            }\n`);
            }
            // default do nothing
            this.output.write(`${indentation}            _ => {}\n`);
            this.output.write(`${indentation}        }\n`);
            break;
          default:
            this.output.write(`${indentation}        self.${name} = reader.get_${type}();\n`);
            break;
        }
      }
    }

    this.output.write(`${indentation}    }\n\n`);

    this.output.write(`${indentation}    fn serialize(&self) -> Vec<EOByte> {\n`);
    this.output.write(`${indentation}        let mut builder = StreamBuilder::new();\n`); // TODO: calculate capacity

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const { name, type, fixedLength, isArray, value } = field;

        const isEnum =
          field !== "BREAK" &&
          !isPrimitive(type) &&
          type !== "struct" &&
          type !== "union" &&
          type !== "function";
        const matchingEnum = isEnum && this.protocol.enums.find((e) => e.name === type);
        if (isEnum && !matchingEnum) {
          throw new Error(`Could not find matching enum: ${type}`);
        }

        switch (true) {
          case isArray:
            this.output.write(`${indentation}        for i in 0..self.${name}.len() {\n`);
            switch (true) {
              case type === "string":
                this.output.write(
                  `${indentation}          builder.add_break_string(&self.${name}[i]);\n`
                );
                break;
              case type === "struct":
                this.output.write(
                  `${indentation}          builder.append(&mut self.${name}[i].serialize());\n`
                );
                break;
              default:
                this.output.write(
                  `${indentation}          builder.add_${type}(self.${name}[i]);\n`
                );
                break;
            }
            this.output.write(`${indentation}        }\n`);
            break;
          case !!value:
            if (isNaN(value)) {
              this.output.write(`${indentation}        builder.add_${type}(b${value});\n`);
            } else {
              this.output.write(`${indentation}        builder.add_${type}(${value});\n`);
            }
            break;
          case isEnum:
            this.output.write(
              `${indentation}        builder.add_${matchingEnum.dataType}(self.${name}.to_${matchingEnum.dataType}());\n`
            );
            break;
          case type === "string":
            this.output.write(`${indentation}        builder.add_break_string(&self.${name});\n`);
            break;
          case type === "raw_string":
            if (fixedLength) {
              this.output.write(
                `${indentation}        builder.add_fixed_string(&self.${name}, ${
                  typeof fixedLength === "string"
                    ? `self.${fixedLength}`
                    : fixedLength
                } as usize);\n`
              );
            } else {
              this.output.write(`${indentation}        builder.add_string(&self.${name});\n`);
            }
            break;
          case field === "BREAK":
            this.output.write(`${indentation}        builder.add_byte(EO_BREAK_CHAR);\n`);
            break;
          case type === "struct":
            this.output.write(
              `${indentation}        builder.append(&mut self.${name}.serialize());\n`
            );
            break;
          case type === "union":
            this.output.write(`${indentation}        match &self.data {\n`);
            for (const unionCase of field.cases) {
              const { type: unionCaseType, name: unionCaseName } = unionCase;
              this.output.write(
                `${indentation}            ${structIdentifier}Data::${removeUnderscores(
                  unionCaseType
                )}(${unionCaseName}) => {\n`
              );
              this.output.write(
                `${indentation}                builder.append(&mut ${unionCaseName}.serialize());\n`
              );
              this.output.write(`${indentation}            }\n`);
            }
            // default do nothing
            this.output.write(`${indentation}            _ => {}\n`);
            this.output.write(`${indentation}        }\n`);
            break;
          default:
            this.output.write(`${indentation}        builder.add_${type}(self.${name});\n`);
            break;
        }
      }
    }

    this.output.write(`${indentation}        builder.get()\n`);
    this.output.write(`${indentation}    }\n`);
    this.output.write(`${indentation}}\n\n`);

    // recursively print unions as structs

    function printUnions(_fields) {
      const unions = _fields.filter(({ type }) => type === "union");
      if (unions) {
        for (const union of unions) {
          for (const unionCase of union.cases) {
            this.exportStruct({
                name: `${name}${unionCase.type}`,
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

  appendWarning() {
    this.output.write(
      "// WARNING! This file was generated automatically. Do NOT edit it manually.\n"
    );
    this.output.write("// https://github.com/sorokya/eo_protocol_parser\n");
  }

  printDocComment(comment, indent = 0) {
    this.output.write(`${'    '.repeat(indent)}/// ${comment}\n`);
  }

  getIdentifierName(name) {
    return removeUnderscores(name);
  }

  getVariableName(name) {
    const variableName = pascalToSnake(removeUnderscores(name));
    if (reserved.includes(variableName)) {
      return `r#${variableName}`;
    }
    return variableName;
  }

  getTypeName(type) {
    switch (type) {
      case "byte":
        return "EOByte";
      case "char":
        return "EOChar";
      case "short":
        return "EOShort";
      case "three":
        return "EOThree";
      case "int":
        return "EOInt";
      case "string":
      case "raw_string":
        return "String";
      default:
        return type;
    }
  }
}

module.exports = { Exporter };
