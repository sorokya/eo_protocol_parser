const {
  getPrimitiveSize,
  isPrimitive,
  pascalToSnake,
  removeUnderscores,
} = require("./utils");

const copyStructs = ["Coords"];

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
  constructor({ protocol, pub, crateName = "eo" }) {
    this.protocol = protocol;
    this.pub = pub;
    this.crateName = crateName === "eo" ? "crate" : "eo";
    this.pubOutput = '';
    this.protocolOutput = '';
  }

  export() {
    this.exportProtocol();
    this.exportPub();

    return {pub: this.pubOutput, protocol: this.protocolOutput};
  }

  exportProtocol() {
    this.outputType = "protocol";
    this.appendWarning();
    this.append("\n");

    this.append(`#[cfg(feature = "serde")]\n`);
    this.append(`use serde::{Deserialize, Serialize};\n`);

    this.append("use log::warn;\n");
    this.append(
      `use ${this.crateName}::data::{EO_BREAK_CHAR, EOByte, EOChar, EOThree, EOInt, EOShort, Serializeable, StreamReader, StreamBuilder};\n\n`
    );

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

    this.append(`#[cfg(feature = "serde")]\n`);
    this.append(`use serde::{Deserialize, Serialize};\n`);

    this.append("use log::warn;\n");
    this.append(
      `use ${this.crateName}::data::{EO_BREAK_CHAR, EOByte, EOChar, EOThree, EOInt, EOShort, Serializeable, StreamReader, StreamBuilder};\n`
    );
    this.append(`use crate::protocol::*;\n\n`);

    this.exportEnums();
    this.exportStructs();
  }

  exportEnums() {
    for (const { comment, name, dataType, variants } of this[this.outputType]
      .enums) {
      const size = getPrimitiveSize(dataType);
      const enumIdentifier = this.getIdentifierName(name);

      this.append(
        `pub const ${pascalToSnake(
          enumIdentifier
        ).toUpperCase()}_SIZE: usize = ${size};\n\n`
      );

      if (comment) {
        this.printDocComment(comment);
      }

      this.append(`#[derive(Debug, Clone, Copy, PartialEq, Eq)]\n`);
      this.append(
        `#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]\n`
      );
      this.append(`pub enum ${enumIdentifier} {\n`);

      for (const [enumValue, enumName] of Object.entries(variants)) {
        const variantIdentifier = this.getIdentifierName(enumName);
        const variantType = this.getTypeName(dataType);

        if (enumValue === "_") {
          this.append(`    ${variantIdentifier}(${variantType}),\n`);
        } else {
          this.append(`    ${variantIdentifier},\n`);
        }
      }

      this.append(`}\n\n`);

      const typeName = this.getTypeName(dataType);
      this.append(`impl ${enumIdentifier} {\n`);
      this.append(
        `    pub fn from_${dataType}(value: ${typeName}) -> Option<Self> {\n`
      );
      this.append(`        match value {\n`);

      const variantsExcludingDefault = Object.entries(variants).filter(
        ([value, _]) => value !== "_"
      );
      const defaultVariant = Object.entries(variants).find(
        ([value, _]) => value === "_"
      );
      for (const [enumValue, enumName] of variantsExcludingDefault) {
        this.append(
          `            ${enumValue} => Some(Self::${removeUnderscores(
            enumName
          )}),\n`
        );
      }

      if (defaultVariant) {
        this.append(
          `            _ => Some(Self::${removeUnderscores(
            defaultVariant[1]
          )}(value)),\n`
        );
      } else {
        this.append(`            _ => {\n`);
        this.append(
          `                warn!("Invalid value for enum ${name}: {}", value);\n`
        );
        this.append(`                None\n`);
        this.append(`            },\n`);
      }

      this.append(`        }\n`);
      this.append(`    }\n\n`);
      this.append(`   pub fn to_${dataType}(self) -> ${typeName} {\n`);
      this.append(`        match self {\n`);
      for (const [enumValue, enumName] of variantsExcludingDefault) {
        this.append(
          `            Self::${removeUnderscores(enumName)} => ${enumValue},\n`
        );
      }
      if (defaultVariant) {
        this.append(
          `            Self::${removeUnderscores(
            defaultVariant[1]
          )}(value) => value,\n`
        );
      }
      this.append(`        }\n`);
      this.append(`    }\n`);
      this.append(`}\n\n`);
      this.append(`impl Default for ${enumIdentifier} {\n`);
      this.append(`    fn default() -> Self {\n`);
      this.append(
        `        ${enumIdentifier}::${removeUnderscores(
          Object.entries(variants)[0][1]
        )}\n`
      );
      this.append(`    }\n`);
      this.append(`}\n\n`);
    }
  }

  exportStructs() {
    for (const struct of this[this.outputType].structs) {
      this.exportStruct(struct);
    }
  }

  exportPackets() {
    for (const who of ["client", "server"]) {
      this.append(`pub mod ${who} {\n`);
      this.append(`    use super::*;\n\n`);

      const families = new Set();
      for (const packet of this.protocol[`${who}Packets`]) {
        families.add(packet.family);
      }
      const sortedFamilies = Array.from(families).sort((a, b) => a - b);

      for (const family of sortedFamilies) {
        this.append(`    pub mod ${family.toLowerCase()} {\n`);
        this.append(`        use super::super::*;\n\n`);
        const packets = this.protocol[`${who}Packets`]
          .filter((p) => p.family === family)
          .sort((a, b) => a.action - b.action);
        for (const packet of packets) {
          this.exportStruct(
            {
              ...packet,
              name: packet.action,
            },
            2
          );
        }
        this.append("    }\n\n");
      }

      this.append("}\n\n");
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
        this.append(
          `${indentation}#[derive(Debug, PartialEq, Eq, Clone)]\npub enum ${structIdentifier}Data {\n`
        );
        for (const unionCase of unionField.cases) {
          const caseName = this.getIdentifierName(unionCase.type);
          this.append(
            `${indentation}    ${caseName}(${structIdentifier}${caseName}),\n`
          );
        }

        this.append(`${indentation}    None,\n`);
        this.append(`${indentation}}\n\n`);

        this.append(
          `${indentation}impl Default for ${structIdentifier}Data {\n`
        );
        this.append(`${indentation}    fn default() -> Self {\n`);
        this.append(
          `${indentation}        Self::${removeUnderscores(
            unionField.cases[0].type
          )}(${name}${removeUnderscores(
            unionField.cases[0].type
          )}::default())\n`
        );
        this.append(`${indentation}    }\n`);
        this.append(`${indentation}}\n\n`);
      }
    }

    const additionalDerives = copyStructs.includes(structIdentifier)
      ? ", Copy"
      : "";

    this.append(
      `${indentation}#[derive(Debug, Default, Clone, PartialEq, Eq${additionalDerives})]\n`
    );
    this.append(`${indentation}pub struct ${structIdentifier} {\n`);

    if (fields && fields.length > 0) {
      const typesWithoutBreaks = fields.filter((field) => {
        return field !== "BREAK";
      });

      for (const field of typesWithoutBreaks) {
        const {
          name: originalName,
          type,
          isArray,
          isOptional,
          arrayLength,
          comment,
        } = field;
        const name = !!originalName ? this.getVariableName(originalName) : "";

        const typeName =
          type === "struct"
            ? this.getIdentifierName(field.struct)
            : this.getTypeName(type);

        const isEnum =
          field !== "BREAK" &&
          !isPrimitive(type) &&
          type !== "struct" &&
          type !== "union" &&
          type !== "sub_string";

        if (comment) {
          this.printDocComment(comment, indents + 1);
        }

        switch (true) {
          case isArray:
            if (typeof arrayLength === "number") {
              if (isOptional) {
                this.append(
                  `${indentation}    pub ${name}: Option<[${typeName}; ${arrayLength}]>,\n`
                );
              } else {
                this.append(
                  `${indentation}    pub ${name}: [${typeName}; ${arrayLength}],\n`
                );
              }
            } else {
              this.append(`${indentation}    pub ${name}: Vec<${typeName}>,\n`);
            }
            break;
          case type === "union":
            this.append(
              `${indentation}    pub data: ${structIdentifier}Data,\n`
            );
          case !name:
            continue;
          case isEnum:
            if (isOptional) {
              this.append(
                `${indentation}    pub ${name}: Option<${this.getIdentifierName(
                  type
                )}>,\n`
              );
              break;
            } else {
              this.append(
                `${indentation}    pub ${name}: ${this.getIdentifierName(
                  type
                )},\n`
              );
              break;
            }
          default:
            if (isOptional) {
              this.append(
                `${indentation}    pub ${name}: Option<${typeName}>,\n`
              );
              break;
            } else {
              this.append(`${indentation}    pub ${name}: ${typeName},\n`);
              break;
            }
        }
      }
    }

    this.append(`${indentation}}\n\n`);

    this.append(`${indentation}impl ${structIdentifier} {\n`);
    this.append(`${indentation}    pub fn new() -> Self {\n`);
    this.append(`${indentation}        Self::default()\n`);
    this.append(`${indentation}    }\n`);
    this.append(`${indentation}}\n\n`);

    this.append(`${indentation}impl Serializeable for ${structIdentifier} {\n`);
    this.append(
      `${indentation}    fn deserialize(&mut self, reader: &StreamReader) {\n`
    );

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const {
          name: originalName,
          type,
          fixedLength,
          fixedLengthOperator,
          fixedLengthOffset,
          isArray,
          isOptional,
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
          // TODO: optional arrays? Probably not needed
          case isArray:
            if (typeof arrayLength === "number") {
              this.append(
                `${indentation}        for i in 0..${arrayLength} {\n`
              );
              switch (true) {
                case type === "string":
                  this.append(
                    `${indentation}          self.${name}[i] = reader.get_break_string();\n`
                  );
                  break;
                case type === "struct":
                  this.append(
                    `${indentation}          self.${name}[i].deserialize(&reader);\n`
                  );
                  break;
                default:
                  this.append(
                    `${indentation}          self.${name}[i] = reader.get_${type}();\n`
                  );
                  break;
              }
              this.append(`${indentation}        }\n`);
            } else if (arrayLength) {
              this.append(
                `${indentation}        for _ in 0..self.${arrayLength} {\n`
              );
              switch (true) {
                case type === "string":
                  this.append(
                    `${indentation}          self.${name}.push(reader.get_break_string());\n`
                  );
                  break;
                case type === "struct":
                  this.append(
                    `${indentation}          let mut ${this.getVariableName(
                      field.struct
                    )} = ${removeUnderscores(field.struct)}::new();\n`
                  );
                  this.append(
                    `${indentation}          ${pascalToSnake(
                      field.struct
                    )}.deserialize(&reader);\n`
                  );
                  this.append(
                    `${indentation}          self.${name}.push(${pascalToSnake(
                      field.struct
                    )});\n`
                  );
                  break;
                default:
                  this.append(
                    `${indentation}          self.${name}.push(reader.get_${type}());\n`
                  );
                  break;
              }
              this.append(`${indentation}        }\n`);
            } else {
              // read till break or EOF
              // TODO: optimize for large packets (files)
              this.append(
                `${indentation}        while !reader.eof() && reader.peek_byte() != EO_BREAK_CHAR {\n`
              );
              switch (true) {
                case type === "string":
                  this.append(
                    `${indentation}          self.${name}.push(reader.get_break_string());\n`
                  );
                  break;
                case type === "struct":
                  this.append(
                    `${indentation}          let mut ${this.getVariableName(
                      field.struct
                    )} = ${this.getIdentifierName(field.struct)}::new();\n`
                  );
                  this.append(
                    `${indentation}          ${pascalToSnake(
                      field.struct
                    )}.deserialize(&reader);\n`
                  );
                  this.append(
                    `${indentation}          self.${name}.push(${pascalToSnake(
                      field.struct
                    )});\n`
                  );
                  break;
                default:
                  this.append(
                    `${indentation}          self.${name}.push(reader.get_${type}());\n`
                  );
                  break;
              }
              this.append(`${indentation}        }\n`);
            }
            break;
          case !!value:
            this.append(`${indentation}        reader.get_${type}();\n`);
            break;
          case isEnum:
            if (field.enumDataType) {
              this.append(
                `${indentation}        self.${name} = ${this.getIdentifierName(
                  type
                )}::from_${matchingEnum.dataType}(reader.get_${
                  field.enumDataType
                }() as ${this.getTypeName(
                  matchingEnum.dataType
                )}).unwrap_or_default();\n`
              );
              break;
            }

            if (isOptional) {
              this.append(
                `${indentation}        self.${name} = if !reader.eof() {\n`
              );
              this.append(
                `${indentation}           Some(${this.getIdentifierName(
                  type
                )}::from_${matchingEnum.dataType}(reader.get_${
                  matchingEnum.dataType
                }()).unwrap_or_default())\n`
              );
              this.append(`${indentation}        } else { None };\n`);
            } else {
              this.append(
                `${indentation}        self.${name} = ${this.getIdentifierName(
                  type
                )}::from_${matchingEnum.dataType}(reader.get_${
                  matchingEnum.dataType
                }()).unwrap_or_default();\n`
              );
            }
            break;
          case type === "string":
            if (isOptional) {
              this.append(
                `${indentation}       self.${name} = if !reader.eof() {\n`
              );
              this.append(
                `${indentation}           Some(reader.get_break_string())\n`
              );
              this.append(`${indentation}       } else { None };\n`);
            } else {
              this.append(
                `${indentation}        self.${name} = reader.get_break_string();\n`
              );
            }
            break;
          case type === "prefix_string":
            if (isOptional) {
              this.append(
                `${indentation}       self.${name} = if !reader.eof() {\n`
              );
              this.append(
                `${indentation}           Some(reader.get_prefix_string())\n`
              );
              this.append(`${indentation}       } else { None };\n`);
            } else {
              this.append(
                `${indentation}        self.${name} = reader.get_prefix_string();\n`
              );
            }
            break;
          case type === "raw_string":
            // Fixed strings shouldn't be optional...
            if (fixedLength) {
              this.append(
                `${indentation}        self.${name} = reader.get_fixed_string(${
                  isNaN(fixedLength) ? `self.${fixedLength}` : fixedLength
                } as usize`
              );

              if (fixedLengthOperator) {
                this.append(` ${fixedLengthOperator} `);
                if (isNaN(fixedLengthOffset)) {
                  this.append(`self.${fixedLengthOffset} as usize`);
                } else {
                  this.append(`${fixedLengthOffset}`);
                }
              }

              this.append(");\n");
            } else {
              if (isOptional) {
                this.append(
                  `${indentation}       self.${name} = if !reader.eof() {\n`
                );
                this.append(
                  `${indentation}           Some(reader.get_end_string())\n`
                );
                this.append(`${indentation}       } else { None };\n`);
              } else {
                this.append(
                  `${indentation}        self.${name} = reader.get_end_string();\n`
                );
              }
            }
            break;
          case type === "emf_string":
            this.append(
              `${indentation}        self.${name} = reader.get_emf_string(${
                isNaN(fixedLength) ? `self.${fixedLength}` : fixedLength
              } as usize`
            );

            if (fixedLengthOperator) {
              this.append(` ${fixedLengthOperator} `);
              if (isNaN(fixedLengthOffset)) {
                this.append(`self.${fixedLengthOffset} as usize`);
              } else {
                this.append(`${fixedLengthOffset}`);
              }
            }

            this.append(");\n");
            break;
          case field === "BREAK":
            this.append(`${indentation}        reader.get_byte();\n`);
            break;
          case type === "struct":
            if (isOptional) {
              this.append(
                `${indentation}        self.${name} = if !reader.eof() {\n`
              );
              this.append(
                `${indentation}           let mut ${this.getVariableName(
                  field.struct
                )} = ${this.getIdentifierName(field.struct)}::default();\n`
              );
              this.append(
                `${indentation}           ${this.getVariableName(
                  field.struct
                )}.deserialize(&reader);\n`
              );
              this.append(
                `${indentation}           Some(${this.getVariableName(
                  field.struct
                )})`
              );
              this.append(`${indentation}       } else { None };\n`);
            } else {
              this.append(
                `${indentation}        self.${name}.deserialize(&reader);\n`
              );
            }
            break;
          case type === "union":
            this.append(
              `${indentation}        match self.${field.variable} {\n`
            );
            const { type: unionVariableType } = fields.find(
              (f) => f.name === field.variable
            );
            const unionEnum = this.protocol.enums.find(
              (e) => e.name === unionVariableType
            );
            for (const unionCase of field.cases) {
              const { type: unionCaseType, name: unionCaseName } = unionCase;
              const variant = Object.entries(unionEnum.variants).find(
                ([_, key]) => key === unionCaseType
              );

              if (variant[0] === "_") {
                this.append(
                  `${indentation}            ${unionVariableType}::${removeUnderscores(
                    unionCaseType
                  )}(_) => {\n`
                );
              } else {
                this.append(
                  `${indentation}            ${unionVariableType}::${removeUnderscores(
                    unionCaseType
                  )} => {\n`
                );
              }

              this.append(
                `${indentation}                let mut ${unionCaseName} = ${structIdentifier}${removeUnderscores(
                  unionCaseType
                )}::new();\n`
              );
              this.append(
                `${indentation}                ${unionCaseName}.deserialize(&reader);\n`
              );
              this.append(
                `${indentation}                self.data = ${structIdentifier}Data::${removeUnderscores(
                  unionCaseType
                )}(${unionCaseName});\n`
              );
              this.append(`${indentation}            }\n`);
            }
            // default do nothing
            this.append(`${indentation}            _ => {}\n`);
            this.append(`${indentation}        }\n`);
            break;
          case type === "sub_string":
            const { string, start, length } = field;
            const skip = isNaN(start) ? `self.${start} as usize` : start;
            const take = isNaN(length) ? `self.${length} as usize` : length;
            this.append(
              `${indentation}        self.${name} = self.${string}.chars()`
            );
            if (skip) {
              this.append(`.skip(${skip})`);
            }
            if (length) {
              this.append(`.take(${take})`);
            }
            this.append(`.collect();\n`);
            break;
          default:
            this.append(
              `${indentation}        self.${name} = reader.get_${type}();\n`
            );
            break;
        }
      }
    }

    this.append(`${indentation}    }\n\n`);

    this.append(`${indentation}    fn serialize(&self) -> Vec<EOByte> {\n`);
    this.append(
      `${indentation}        let mut builder = StreamBuilder::new();\n`
    ); // TODO: calculate capacity

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const {
          name: originalName,
          type,
          fixedLength,
          isArray,
          value,
          isOptional,
        } = field;
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
              `${indentation}        for i in 0..self.${name}.len() {\n`
            );
            switch (true) {
              case type === "string":
                this.append(
                  `${indentation}          builder.add_break_string(&self.${name}[i]);\n`
                );
                break;
              case type === "prefix_string":
                this.append(
                  `${indentation}          builder.add_prefix_string(&self.${name}[i]);\n`
                );
                break;
              case type === "emf_string":
                this.append(
                  `${indentation}          builder.add_emf_string(&self.${name}[i]);\n`
                );

                if (fixedLength) {
                  this.append(
                    `${indentation}          builder.append(&mut vec![0xFF; ${
                      isNaN(fixedLength)
                        ? `self.${fixedLength} as usize`
                        : fixedLength
                    } - self.${name}[i].len()]);\n`
                  );
                }

                break;
              case type === "struct":
                this.append(
                  `${indentation}          builder.append(&mut self.${name}[i].serialize());\n`
                );
                break;
              default:
                this.append(
                  `${indentation}          builder.add_${type}(self.${name}[i]);\n`
                );
                break;
            }
            this.append(`${indentation}        }\n`);
            break;
          case !!value:
            if (isNaN(value)) {
              this.append(
                `${indentation}        builder.add_${type}(b${value});\n`
              );
            } else {
              this.append(
                `${indentation}        builder.add_${type}(${value});\n`
              );
            }
            break;
          case isEnum:
            if (isOptional) {
              this.append(
                `${indentation}        if let Some(${name}) = self.${name} {\n`
              );
              this.append(
                `${indentation}            builder.add_${matchingEnum.dataType}(${name}.to_${matchingEnum.dataType}());\n`
              );
              this.append(`${indentation}        }\n`);
            } else {
              this.append(
                `${indentation}        builder.add_${matchingEnum.dataType}(self.${name}.to_${matchingEnum.dataType}());\n`
              );
            }
            break;
          case type === "string":
            if (isOptional) {
              this.append(
                `${indentation}        if let Some(${name}) = &self.${name} {\n`
              );
              this.append(
                `${indentation}            builder.add_break_string(${name});\n`
              );
              this.append(`${indentation}        }\n`);
            } else {
              this.append(
                `${indentation}        builder.add_break_string(&self.${name});\n`
              );
            }
            break;
          case type === "prefix_string":
            if (isOptional) {
              this.append(
                `${indentation}        if let Some(${name}) = &self.${name} {\n`
              );
              this.append(
                `${indentation}            builder.add_prefix_string(${name});\n`
              );
              this.append(`${indentation}        }\n`);
            } else {
              this.append(
                `${indentation}        builder.add_prefix_string(&self.${name});\n`
              );
            }
            break;
          case type === "emf_string":
            this.append(
              `${indentation}        builder.add_emf_string(&self.${name});\n`
            );

            if (fixedLength) {
              this.append(
                `${indentation}        builder.append(&mut vec![0xFF; ${
                  isNaN(fixedLength)
                    ? `self.${fixedLength} as usize`
                    : fixedLength
                } - self.${name}.len()]);\n`
              );
            }

            break;
          case type === "raw_string":
            if (fixedLength) {
              this.append(
                `${indentation}        builder.add_fixed_string(&self.${name}, ${
                  typeof fixedLength === "string"
                    ? `self.${fixedLength}`
                    : fixedLength
                } as usize);\n`
              );
            } else {
              if (isOptional) {
                this.append(
                  `${indentation}        if let Some(${name}) = &self.${name} {\n`
                );
                this.append(
                  `${indentation}            builder.add_string(${name});\n`
                );
                this.append(`${indentation}        }\n`);
              } else {
                this.append(
                  `${indentation}        builder.add_string(&self.${name});\n`
                );
              }
            }
            break;
          case field === "BREAK":
            this.append(
              `${indentation}        builder.add_byte(EO_BREAK_CHAR);\n`
            );
            break;
          case type === "struct":
            if (isOptional) {
              this.append(
                `${indentation}        if let Some(${name}) = &self.${name} {\n`
              );
              this.append(
                `${indentation}            builder.append(&mut ${name}.serialize());\n`
              );
              this.append(`${indentation}        }\n`);
            } else {
              this.append(
                `${indentation}        builder.append(&mut self.${name}.serialize());\n`
              );
            }
            break;
          case type === "union":
            this.append(`${indentation}        match &self.data {\n`);
            for (const unionCase of field.cases) {
              const { type: unionCaseType, name: unionCaseName } = unionCase;
              this.append(
                `${indentation}            ${structIdentifier}Data::${removeUnderscores(
                  unionCaseType
                )}(${unionCaseName}) => {\n`
              );
              this.append(
                `${indentation}                builder.append(&mut ${unionCaseName}.serialize());\n`
              );
              this.append(`${indentation}            }\n`);
            }
            // default do nothing
            this.append(`${indentation}            _ => {}\n`);
            this.append(`${indentation}        }\n`);
            break;
          case type === "sub_string":
            // no-op
            break;
          default:
            this.append(
              `${indentation}        builder.add_${type}(self.${name});\n`
            );
            break;
        }
      }
    }

    this.append(`${indentation}        builder.get()\n`);
    this.append(`${indentation}    }\n`);
    this.append(`${indentation}}\n\n`);

    // recursively print unions as structs

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
    this.append(`${"    ".repeat(indent)}/// ${comment}\n`);
  }

  getIdentifierName(name) {
    const identifierName = removeUnderscores(name);
    if (reserved.includes(identifierName)) {
      return `r#${identifierName}`;
    }
    return identifierName;
  }

  getVariableName(name) {
    const variableAlreadySnakeCase = name === name.toLowerCase();
    const variableName = variableAlreadySnakeCase
      ? name
      : pascalToSnake(removeUnderscores(name));
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
      case "sub_string":
      case "prefix_string":
      case "emf_string":
        return "String";
      default:
        return type;
    }
  }
}

module.exports = { Exporter };
