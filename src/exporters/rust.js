const fs = require("fs");
const {
  pascalToSnake,
  resetOutputDirectory,
  removeUnderscores,
} = require("./utils");

const reserved = ['as', 'break', 'const', 'continue', 'create', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'async', 'await', 'dyn'];

function prependIfReserved(name) {
  if (reserved.includes(name)) {
    return `r#${name}`;
  }
  return name;
}

function rust(protocol, outputDirectory) {
  resetOutputDirectory(outputDirectory, "rust");
  createDirectories(outputDirectory);

  createModFile(`${outputDirectory}/rust`);
  printEnums(protocol.enums, outputDirectory);
  printStructs(protocol.structs, protocol.enums, outputDirectory);
  createModFile(`${outputDirectory}/rust/packets`);
  printPackets(
    protocol.clientPackets,
    protocol.enums,
    `${outputDirectory}/rust/packets/client`
  );
  printPackets(
    protocol.serverPackets,
    protocol.enums,
    `${outputDirectory}/rust/packets/server`
  );

  const modFile = fs.createWriteStream(`${outputDirectory}/rust/mod.rs`, {
    encoding: "utf8",
    flags: "a",
  });

  modFile.write("pub mod packets;");
  modFile.close();

  appendWarningToModFile(`${outputDirectory}/rust`);
}

function createDirectories(outputDirectory) {
  fs.mkdirSync(`${outputDirectory}/rust/packets`);
  fs.mkdirSync(`${outputDirectory}/rust/packets/client`);
  fs.mkdirSync(`${outputDirectory}/rust/packets/server`);
}

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

function printWarning(output) {
  output.write(
    "// WARNING! This file was generated automatically. Do NOT edit it manually.\n"
  );
  output.write("// https://github.com/sorokya/eo_protocol_parser\n\n");
}

function printDocComment(output, comment) {
  output.write(`/// ${comment}\n`);
}

function getTypeName(dataType) {
  switch (dataType) {
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
      return dataType;
  }
}

function getPrimitiveSize(dataType) {
  switch (dataType) {
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
      throw new Error(`Primitive type not handled: ${dataType}`);
  }
}

function createModFile(outputDirectory) {
  const modFile = fs.createWriteStream(`${outputDirectory}/mod.rs`, {
    encoding: "utf8",
  });

  printWarning(modFile);
  modFile.close();
}

function appendWarningToModFile(outputDirectory) {
  const modFile = fs.createWriteStream(`${outputDirectory}/mod.rs`, {
    encoding: "utf8",
    flags: "a",
  });

  modFile.write("\n");
  printWarning(modFile);
  modFile.close();
}

function printEnums(enums, outputDirectory) {
  for (const enumer of enums) {
    const { comment, name: originalName, dataType, variants } = enumer;

    const name = removeUnderscores(originalName);
    const snakeCaseName = pascalToSnake(name);
    const size = getPrimitiveSize(dataType);

    const output = fs.createWriteStream(
      `${outputDirectory}/rust/${snakeCaseName}.rs`,
      {
        encoding: "utf8",
      }
    );

    printWarning(output);

    output.write(`use log::warn;\n`);
    output.write(`use crate::data::${getTypeName(dataType)};\n`);

    output.write("\n");

    output.write(
      `pub const ${snakeCaseName.toUpperCase()}_SIZE: usize = ${size};\n\n`
    );

    if (comment) {
      printDocComment(output, comment);
    }

    output.write(`#[derive(Debug, Clone, Copy, PartialEq, Eq)]\n`);
    output.write(`pub enum ${name} {\n`);

    for (const [enumValue, enumName] of Object.entries(variants)) {
      if (enumValue === "_") {
        output.write(`    ${removeUnderscores(enumName)}(${getTypeName(dataType)}),\n`);
      } else {
        output.write(`    ${removeUnderscores(enumName)},\n`);
      }
    }

    output.write(`}\n\n`);

    const typeName = getTypeName(dataType);
    output.write(`impl ${name} {\n`);
    output.write(`    pub fn from_${dataType}(value: ${typeName}) -> Self {\n`);
    output.write(`        match value {\n`);

    const variantsExcludingDefault = Object.entries(variants).filter(([value, _]) => value !== "_");
    const defaultVariant = Object.entries(variants).find(([value, _]) => value === "_");
    for (const [enumValue, enumName] of variantsExcludingDefault) {
      output.write(`            ${enumValue} => Self::${removeUnderscores(enumName)},\n`);
    }

    if (defaultVariant) {
      output.write(`            _ => Self::${removeUnderscores(defaultVariant[1])}(value),\n`);
    } else {
      output.write(`            _ => {\n`);
      output.write(`                warn!("Invalid value for enum ${name}: {}", value);\n`);
      output.write(`                Self::${removeUnderscores(variantsExcludingDefault[0][1])}\n`);
      output.write(`            },\n`);
    }

    output.write(`        }\n`);
    output.write(`    }\n\n`);
    output.write(`   pub fn to_${dataType}(self) -> ${typeName} {\n`);
    output.write(`        match self {\n`);
    for (const [enumValue, enumName] of variantsExcludingDefault) {
      output.write(`            Self::${removeUnderscores(enumName)} => ${enumValue},\n`);
    }
    if (defaultVariant) {
      output.write(`            Self::${removeUnderscores(defaultVariant[1])}(value) => value,\n`);
    }
    output.write(`        }\n`);
    output.write(`    }\n`);
    output.write(`}\n\n`);
    output.write(`impl Default for ${name} {\n`);
    output.write(`    fn default() -> Self {\n`);
    output.write(
      `        ${name}::${removeUnderscores(Object.entries(variants)[0][1])}\n`
    );
    output.write(`    }\n`);
    output.write(`}\n`);

    printWarning(output);
    output.close();

    const modFile = fs.createWriteStream(`${outputDirectory}/rust/mod.rs`, {
      encoding: "utf8",
      flags: "a",
    });

    modFile.write(`mod ${prependIfReserved(snakeCaseName)};\n`);
    modFile.write(
      `pub use ${prependIfReserved(snakeCaseName)}::*;\n`
    );
    modFile.close();
  }
}

function printStructs(structs, enums, outputDirectory) {
  for (const struct of structs) {
    const snakeCaseName = pascalToSnake(struct.name);
    const output = fs.createWriteStream(
      `${outputDirectory}/rust/${snakeCaseName}.rs`,
      {
        encoding: "utf8",
      }
    );

    printWarning(output);

    // recursively find all types used in the struct and enums
    const uniqueTypes = new Set(["EOByte"]);
    function findTypes(fields) {
      for (const field of fields) {
        if (field.type === "union") {
          for (const unionCase of field.cases) {
            findTypes(unionCase.fields);
          }
        } else if (field === "BREAK") {
          uniqueTypes.add("EO_BREAK_CHAR");
        } else {
          const typeName =
            field.type === "struct" ? field.struct : getTypeName(field.type);
          uniqueTypes.add(typeName);
        }
      }
    }

    findTypes(struct.fields);
    uniqueTypes.delete(undefined);

    const primitiveTypes = [
      "EOByte",
      "EOChar",
      "EOShort",
      "EOThree",
      "EOInt",
      "EO_BREAK_CHAR",
    ];
    const usedPrimitives = Array.from(uniqueTypes).filter((t) =>
      primitiveTypes.includes(t)
    );
    const nonPrimitives = Array.from(uniqueTypes).filter(
      (t) => !primitiveTypes.includes(t) && t !== "String"
    ).map((t) => removeUnderscores(t));

    output.write(
      `use crate::data::{${usedPrimitives
        .concat(["Serializeable", "StreamBuilder", "StreamReader"])
        .sort()
        .join(", ")}};\n`
    );

    if (nonPrimitives && nonPrimitives.length > 0) {
      output.write(`use crate::{${nonPrimitives.sort().join(", ")}};\n`);
    }

    printStructLike(output, struct, enums);
    printWarning(output);
    output.close();

    const modFile = fs.createWriteStream(`${outputDirectory}/rust/mod.rs`, {
      encoding: "utf8",
      flags: "a",
    });

    modFile.write(`mod ${prependIfReserved(snakeCaseName)};\n`);
    modFile.write(
      `pub use ${prependIfReserved(snakeCaseName)}::*;\n`
    );
    modFile.close();
  }
}

function printPackets(packets, enums, outputDirectory) {
  // output/rust/packets/{server/client}/mod.rs
  createModFile(outputDirectory);

  const families = new Set();
  for (const packet of packets) {
    families.add(packet.family);
  }

  for (const family of families) {
    const familyName = pascalToSnake(family);
    const familyDirectory = `${outputDirectory}/${familyName}`;

    // create family directory
    fs.mkdirSync(familyDirectory);

    // create family mod file
    createModFile(familyDirectory);

    const packetsForFamily = packets.filter((p) => p.family === family);
    for (const packet of packetsForFamily) {
      const actionName = pascalToSnake(packet.action);
      const output = fs.createWriteStream(
        `${familyDirectory}/${actionName}.rs`,
        {
          encoding: "utf8",
        }
      );

      printWarning(output);

      // recursively find all types used in the struct and enums
      const uniqueTypes = new Set(["EOByte", "EO_BREAK_CHAR"]);
      function findTypes(fields) {
        if (!fields) {
          return;
        }
        for (const field of fields) {
          if (field.type === "union") {
            for (const unionCase of field.cases) {
              findTypes(unionCase.fields);
            }
          } else if (field === "BREAK") {
            uniqueTypes.add("EO_BREAK_CHAR");
          } else {
            const typeName =
              field.type === "struct" ? field.struct : getTypeName(field.type);
            uniqueTypes.add(removeUnderscores(typeName));
          }
        }
      }

      findTypes(packet.fields);
      uniqueTypes.delete(undefined);

      const primitiveTypes = [
        "EOByte",
        "EOChar",
        "EOShort",
        "EOThree",
        "EOInt",
        "EO_BREAK_CHAR",
      ];
      const usedPrimitives = Array.from(uniqueTypes).filter((t) =>
        primitiveTypes.includes(t)
      );
      const nonPrimitives = Array.from(uniqueTypes).filter(
        (t) => !primitiveTypes.includes(t) && t !== "String"
      );

      output.write(
        `use crate::data::{${usedPrimitives
          .concat(["Serializeable", "StreamBuilder", "StreamReader"])
          .sort()
          .join(", ")}};\n`
      );

      if (nonPrimitives && nonPrimitives.length > 0) {
        output.write(`use crate::{${nonPrimitives.sort().join(", ")}};\n`);
      }

      printStructLike(
        output,
        {
          ...packet,
          name: packet.action,
        },
        enums
      );

      printWarning(output);

      output.close();

      const familyModFile = fs.createWriteStream(`${familyDirectory}/mod.rs`, {
        encoding: "utf8",
        flags: "a",
      });

      familyModFile.write(`mod ${prependIfReserved(actionName)};\n`);
      familyModFile.write(
        `pub use ${prependIfReserved(actionName)}::*;\n`
      );
      familyModFile.close();
    }
  }

  const modFile = fs.createWriteStream(
    `${outputDirectory}/mod.rs`,
    {
      encoding: "utf8",
      flags: "a",
    }
  );

  for (const family of families) {
    const familyName = pascalToSnake(family);
    modFile.write(`pub mod ${prependIfReserved(familyName)};\n`);
  }
  printWarning(modFile);
  modFile.close();

  const outerModFile = fs.createWriteStream(
    `${outputDirectory}/../mod.rs`,
    {
      encoding: "utf8",
      flags: "a",
    });

  const pathParts = outputDirectory.split('/');
  outerModFile.write(`pub mod ${pathParts[pathParts.length - 1]};\n`);
}

function printStructLike(output, struct, enums) {
  const { comment, name: originalName, fields } = struct;

  const name = removeUnderscores(originalName);

  output.write("\n");

  if (comment) {
    printDocComment(output, comment);
  }

  // Create union enums
  const unionFields = fields?.filter((f) => f.type === "union");
  if (unionFields) {
    for (const unionField of unionFields) {
      output.write(
        `#[derive(Debug, PartialEq, Eq, Clone)]\npub enum ${name}Data {\n`
      );
      for (const unionCase of unionField.cases) {
        const caseName = removeUnderscores(unionCase.type);
        output.write(`    ${caseName}(${name}${caseName}),\n`);
      }
      output.write("}\n\n");

      output.write(`impl Default for ${name}Data {\n`);
      output.write(`    fn default() -> Self {\n`);
      output.write(`        Self::${removeUnderscores(unionField.cases[0].type)}(${name}${removeUnderscores(unionField.cases[0].type)}::default())\n`);
      output.write(`    }\n`);
      output.write(`}\n\n`);
    }
  }

  output.write(`#[derive(Debug, Default, Clone, PartialEq, Eq)]\n`);
  output.write(`pub struct ${name} {\n`);

  const structName = name;

  if (fields && fields.length > 0) {
    const typesWithoutBreaks = fields.filter((field) => {
      return field !== "BREAK";
    });

    for (const field of typesWithoutBreaks) {
      const { name, type, isArray, arrayLength } = field;

      const typeName = type === "struct" ? removeUnderscores(field.struct) : getTypeName(type);

      switch (true) {
        case isArray:
          if (typeof arrayLength === "number") {
            output.write(`    pub ${name}: [${typeName}; ${arrayLength}],\n`);
          } else {
            output.write(`    pub ${name}: Vec<${typeName}>,\n`);
          }
          break;
        case type === "union":
          output.write(`    pub data: ${structName}Data,\n`);
        case !name:
          continue;
        default:
          output.write(`    pub ${name}: ${typeName},\n`);
          break;
      }
    }
  }

  output.write(`}\n\n`);

  output.write(`impl ${name} {\n`);
  output.write(`    pub fn new() -> Self {\n`);
  output.write(`        Self::default()\n`);
  output.write(`    }\n`);
  output.write(`}\n\n`);

  output.write(`impl Serializeable for ${name} {\n`);
  output.write(`    fn deserialize(&mut self, reader: &StreamReader) {\n`);

  if (fields && fields.length > 0) {
    for (const field of fields) {
      const { name, type, fixedLength, isArray, arrayLength, value } = field;

      const isEnum =
        field !== "BREAK" &&
        !isPrimitive(type) &&
        type !== "struct" &&
        type !== "union" &&
        type !== "function";
      const matchingEnum = isEnum && enums.find((e) => e.name === type);
      if (isEnum && !matchingEnum) {
        throw new Error(`Could not find matching enum: ${type}`);
      }

      switch (true) {
        case isArray:
          if (typeof arrayLength === "number") {
            output.write(`        for i in 0..${arrayLength} {\n`);
            switch (true) {
              case type === "string":
                output.write(
                  `          self.${name}[i] = reader.get_break_string();\n`
                );
                break;
              case type === "struct":
                output.write(
                  `          self.${name}[i].deserialize(&reader);\n`
                );
                break;
              default:
                output.write(
                  `          self.${name}[i] = reader.get_${type}();\n`
                );
                break;
            }
            output.write(`        }\n`);
          } else if (arrayLength) {
            output.write(`        for _ in 0..self.${arrayLength} {\n`);
            switch (true) {
              case type === "string":
                output.write(
                  `          self.${name}.push(reader.get_break_string());\n`
                );
                break;
              case type === "struct":
                output.write(
                  `          let mut ${pascalToSnake(field.struct)} = ${
                    removeUnderscores(field.struct)
                  }::new();\n`
                );
                output.write(
                  `          ${pascalToSnake(
                    field.struct
                  )}.deserialize(&reader);\n`
                );
                output.write(
                  `          self.${name}.push(${pascalToSnake(
                    field.struct
                  )});\n`
                );
                break;
              default:
                output.write(
                  `          self.${name}.push(reader.get_${type}());\n`
                );
                break;
            }
            output.write(`        }\n`);
          } else {
            // read till break or EOF
            output.write(
              `        while !reader.eof() && reader.peek_byte() != EO_BREAK_CHAR {\n`
            );
            switch (true) {
              case type === "string":
                output.write(
                  `          self.${name}.push(reader.get_break_string());\n`
                );
                break;
              case type === "struct":
                output.write(
                  `          let mut ${pascalToSnake(field.struct)} = ${
                    removeUnderscores(field.struct)
                  }::new();\n`
                );
                output.write(
                  `          ${pascalToSnake(
                    field.struct
                  )}.deserialize(&reader);\n`
                );
                output.write(
                  `          self.${name}.push(${pascalToSnake(
                    field.struct
                  )});\n`
                );
                break;
              default:
                output.write(
                  `          self.${name}.push(reader.get_${type}());\n`
                );
                break;
            }
            output.write(`        }\n`);
          }
          break;
        case !!value:
          output.write(`        reader.get_${type}();\n`);
          break;
        case isEnum:
          output.write(
            `        self.${name} = ${type}::from_${matchingEnum.dataType}(reader.get_${matchingEnum.dataType}());\n`
          );
          break;
        case type === "string":
          output.write(`        self.${name} = reader.get_break_string();\n`);
          break;
        case type === "raw_string":
          if (fixedLength) {
            output.write(
              `        self.${name} = reader.get_fixed_string(${
                typeof fixedLength === "string"
                  ? `self.${fixedLength}`
                  : fixedLength
              } as usize);\n`
            );
          } else {
            output.write(`        self.${name} = reader.get_end_string();\n`);
          }
          break;
        case field === "BREAK":
          output.write(`        reader.get_byte();\n`);
          break;
        case type === "struct":
          output.write(`        self.${name}.deserialize(&reader);\n`);
          break;
        case type === "union":
            output.write(`        match self.${field.variable} {\n`);
            const {type: unionVariableType} = fields.find((f) => f.name === field.variable);
            for (const unionCase of field.cases) {
                const {type: unionCaseType, name: unionCaseName} = unionCase;
                output.write(`            ${unionVariableType}::${removeUnderscores(unionCaseType)} => {\n`);
                output.write(`                let mut ${unionCaseName} = ${structName}${removeUnderscores(unionCaseType)}::new();\n`);
                output.write(`                ${unionCaseName}.deserialize(&reader);\n`);
                output.write(`                self.data = ${structName}Data::${removeUnderscores(unionCaseType)}(${unionCaseName});\n`);
                output.write(`            }\n`);
            }
            // default do nothing
            output.write(`            _ => {}\n`);
            output.write(`        }\n`);
            break;
        default:
          output.write(`        self.${name} = reader.get_${type}();\n`);
          break;
      }
    }
  }

  output.write(`    }\n\n`);

  output.write(`    fn serialize(&self) -> Vec<EOByte> {\n`);
  output.write(`        let mut builder = StreamBuilder::new();\n`); // TODO: calculate capacity

  if (fields && fields.length > 0) {
    for (const field of fields) {
      const { name, type, fixedLength, isArray, value } = field;

      const isEnum =
        field !== "BREAK" &&
        !isPrimitive(type) &&
        type !== "struct" &&
        type !== "union" &&
        type !== "function";
      const matchingEnum = isEnum && enums.find((e) => e.name === type);
      if (isEnum && !matchingEnum) {
        throw new Error(`Could not find matching enum: ${type}`);
      }

      switch (true) {
        case isArray:
          output.write(`        for i in 0..self.${name}.len() {\n`);
          switch (true) {
            case type === "string":
              output.write(
                `          builder.add_break_string(&self.${name}[i]);\n`
              );
              break;
            case type === "struct":
              output.write(
                `          builder.append(&mut self.${name}[i].serialize());\n`
              );
              break;
            default:
              output.write(`          builder.add_${type}(self.${name}[i]);\n`);
              break;
          }
          output.write(`        }\n`);
          break;
        case !!value:
          if (isNaN(value)) {
            output.write(`        builder.add_${type}(b${value});\n`);
          } else {
            output.write(`        builder.add_${type}(${value});\n`);
          }
          break;
        case isEnum:
          output.write(
            `        builder.add_${matchingEnum.dataType}(self.${name}.to_${matchingEnum.dataType}());\n`
          );
          break;
        case type === "string":
          output.write(`        builder.add_break_string(&self.${name});\n`);
          break;
        case type === "raw_string":
          if (fixedLength) {
            output.write(
              `        builder.add_fixed_string(&self.${name}, ${
                typeof fixedLength === "string"
                  ? `self.${fixedLength}`
                  : fixedLength
              } as usize);\n`
            );
          } else {
            output.write(`        builder.add_string(&self.${name});\n`);
          }
          break;
        case field === "BREAK":
          output.write(`        builder.add_byte(EO_BREAK_CHAR);\n`);
          break;
        case type === "struct":
          output.write(
            `        builder.append(&mut self.${name}.serialize());\n`
          );
          break;
        case type === "union":
            output.write(`        match &self.data {\n`);
            const {type: unionVariableType} = fields.find((f) => f.name === field.variable);
            for (const unionCase of field.cases) {
                const {type: unionCaseType, name: unionCaseName} = unionCase;
                output.write(`            ${structName}Data::${removeUnderscores(unionCaseType)}(${unionCaseName}) => {\n`);
                output.write(`                builder.append(&mut ${unionCaseName}.serialize());\n`);
                output.write(`            }\n`);
            }
            // default do nothing
            output.write(`            _ => {}\n`);
            output.write(`        }\n`);
            break;
        default:
          output.write(`        builder.add_${type}(self.${name});\n`);
          break;
      }
    }
  }

  output.write(`        builder.get()\n`);
  output.write(`    }\n`);
  output.write(`}\n`);

  // recursively print unions as structs

  function printUnions(_fields) {
    const unions = _fields.filter(({ type }) => type === "union");
    if (unions) {
      for (const union of unions) {
        for (const unionCase of union.cases) {
          printStructLike(
            output,
            {
              name: `${name}${unionCase.type}`,
              fields: unionCase.fields,
            },
            enums
          );
        }
      }
    }
  }

  if (fields && fields.length > 0) {
    printUnions(fields);
  }
}

module.exports = rust;
