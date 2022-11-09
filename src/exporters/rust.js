const fs = require('fs');
const { pascalToSnake, resetOutputDirectory, removeUnderscores } = require('./utils');

function rust (protocol, outputDirectory) {
    resetOutputDirectory(outputDirectory, 'rust');
    createDirectories(outputDirectory);

    createModFile(outputDirectory);
    printEnums(protocol.enums, outputDirectory);
    printStructs(protocol.structs, outputDirectory);
    // printPackets(protocol.clientPackets, protocol.serverPackets, outputDirectory);
    appendWarningToModFile(outputDirectory);
}

function createDirectories(outputDirectory) {
    fs.mkdirSync(`${outputDirectory}/rust/packets`);
    fs.mkdirSync(`${outputDirectory}/rust/packets/client`);
    fs.mkdirSync(`${outputDirectory}/rust/packets/server`);
}

function printWarning(output) {
    output.write('// WARNING! This file was generated automatically. Do NOT edit it manually.\n');
    output.write('// https://github.com/sorokya/eo_protocol_parser\n\n');
}

function printDocComment(output, comment) {
    output.write(`/// ${comment}\n`);
}

function getTypeName(dataType) {
    switch (dataType) {
        case 'byte':
            return 'EOByte';
        case 'char':
            return 'EOChar';
        case 'short':
            return 'EOShort';
        case 'three':
            return 'EOThree';
        case 'int':
            return 'EOInt';
        case 'string':
        case 'raw_string':
            return 'String';
        default:
            return dataType;
    }
}

function getPrimitiveSize (dataType) {
    switch (dataType) {
        case 'byte':
        case 'char':
            return 1;
        case 'short':
            return 2;
        case 'three':
            return 3;
        case 'int':
            return 4;
        default:
            throw new Error(`Primitive type not handled: ${dataType}`);
    }
}

function createModFile(outputDirectory) {
    const modFile = fs.createWriteStream(`${outputDirectory}/rust/mod.rs`, {
        encoding: 'utf8'
    });

    printWarning(modFile);
    modFile.close();
}

function appendWarningToModFile(outputDirectory) {
    const modFile = fs.createWriteStream(`${outputDirectory}/rust/mod.rs`, {
        encoding: 'utf8',
        flags: 'a'
    });

    modFile.write('\n');
    printWarning(modFile);
    modFile.close();
}

function printEnums(enums, outputDirectory) {
    for (const enumer of enums) {
        const {
            comment,
            name: originalName,
            dataType,
            variants
        } = enumer;

        const name = removeUnderscores(originalName);
        const snakeCaseName = pascalToSnake(name);
        const size = getPrimitiveSize(dataType);

        const output = fs.createWriteStream(`${outputDirectory}/rust/${snakeCaseName}.rs`, {
            encoding: 'utf8'
        });

        printWarning(output);

        output.write('use std::convert::From;\n')
        output.write('use log::warn;\n');
        output.write('use num_traits::FromPrimitive;\n');

        output.write('\n');

        output.write(`pub const ${snakeCaseName.toUpperCase()}_SIZE: usize = ${size};\n\n`);

        if (comment) {
            printDocComment(output, comment);
        }

        output.write(`#[derive(Debug, Clone, Copy, PartialEq, Primitive)]\n`);
        output.write(`pub enum ${name} {\n`);

        for (const [enumValue, enumName] of Object.entries(variants)) {
            output.write(`    ${removeUnderscores(enumName)} = ${enumValue},\n`);
        }

        output.write(`}\n\n`);

        const typeName = getTypeName(dataType);
        output.write(`impl From<${typeName}> for ${name} {\n`);
        output.write(`    fn from(value: ${typeName}) -> Self {\n`);
        output.write(`        match ${name}::from_u8(value) {\n`);
        output.write(`            Some(value) => value,\n`);
        output.write(`            None => {\n`);
        output.write(`                warn!("Unknown value for enum ${name}: {}", value);\n`);
        output.write(`                ${name}::default()\n`);
        output.write(`            }\n`);
        output.write(`        }\n`);
        output.write(`    }\n`);
        output.write(`}\n\n`);
        output.write(`impl Default for ${name} {\n`);
        output.write(`    fn default() -> Self {\n`);
        output.write(`        ${name}::${removeUnderscores(Object.entries(variants)[0][1])}\n`);
        output.write(`    }\n`);
        output.write(`}\n`);

        printWarning(output);
        output.close();

        const modFile = fs.createWriteStream(`${outputDirectory}/rust/mod.rs`, {
            encoding: 'utf8',
            flags: 'a',
        });

        modFile.write(`mod ${snakeCaseName};\n`);
        modFile.write(`pub use ${snakeCaseName}::{${name}, ${snakeCaseName.toUpperCase()}_SIZE};\n`);
    }
}

function printStructs(structs, outputDirectory) {
    for (const struct of structs) {
        const snakeCaseName = pascalToSnake(struct.name);
        const output = fs.createWriteStream(`${outputDirectory}/rust/${snakeCaseName}.rs`, {
            encoding: 'utf8'
        });

        printWarning(output);

        // recursively find all types used in the struct and enums
        const uniqueTypes = new Set(['EOByte']);
        function findTypes (fields) {
            for (const field of fields) {
                if (field.type === 'union') {
                    for (const unionCase of field.cases) {
                        findTypes(unionCase.fields);
                    }
                } else {
                    uniqueTypes.add(getTypeName(field.type));
                }
            }
        }

        findTypes(struct.fields);

        const primitiveTypes = ['EOByte', 'EOChar', 'EOShort', 'EOThree', 'EOInt'];
        const usedPrimitives = Array.from(uniqueTypes).filter((t) => primitiveTypes.includes(t));
        const nonPrimitives = Array.from(uniqueTypes).filter((t) => !primitiveTypes.includes(t));

        output.write(`use eo::data::{${usedPrimitives.join(', ')}, Serializeable, StreamBuilder, StreamReader};\n`);

        if (nonPrimitives) {
            output.write(`use super::{${nonPrimitives.join(', ')}};\n`);
        }

        printStructLike(output, struct);
        printWarning(output);

        output.close();
    }
}

function printStructLike (output, struct) {
    const {
        comment,
        name: originalName,
        fields
    } = struct;

    const name = removeUnderscores(originalName);

    output.write('\n');

    if (comment) {
        printDocComment(output, comment);
    }

    output.write(`#[derive(Debug, Default, Clone)]\n`);
    output.write(`pub struct ${name} {\n`);

    const typesWithoutBreaksOrUnions = fields.filter((field) => {
        return field !== 'BREAK' && field.type !== 'union';
    });

    const usedTypes = new Set();

    for (const field of typesWithoutBreaksOrUnions) {
        const {
            name,
            type
        } = field;

        const typeName = getTypeName(type);

        usedTypes.add(typeName);

        output.write(`    pub ${name}: ${typeName},\n`);
    }

    output.write(`}\n\n`);

    output.write(`impl ${name} {\n`);
    output.write(`    fn new() -> Self {\n`);
    output.write(`        Self::default()\n`);
    output.write(`    }\n`);
    output.write(`}\n\n`);

    output.write(`impl Serializeable for ${name} {\n`);
    output.write(`    fn deserialize(&mut self, reader: &StreamReader) {\n`);

    for (const field of fields) {
        const {
            name,
            type,
            fixedLength
        } = field;

        if (type === 'string') {
            output.write(`        self.${name} = reader.get_break_string();\n`);
        } else if (type === 'raw_string') {
            if (fixedLength) {
                output.write(`        self.${name} = reader.get_fixed_string(${typeof fixedLength === 'string' ? `self.${fixedLength}` : fixedLength});\n`);
            } else {
                output.write(`        self.${name} = reader.get_end_string();\n`);
            }
        } else if (field === 'BREAK') {
            output.write(`        reader.seek(1); // BREAK_CHAR\n`);
        } else {
            output.write(`        self.${name} = reader.get_${type}();\n`);
        }
    }

    output.write(`    }\n\n`);

    output.write(`    fn serialize(&self) -> Vec<EOByte> {\n`);
    output.write(`        let mut builder = StreamBuilder::new();\n`); // TODO: calculate capacity

    for (const field of fields) {
        const {
            name,
            type
        } = field;

        output.write(`        builder.add_${type}(self.${name});\n`);
    }

    output.write(`        builder.get()\n`);
    output.write(`    }\n`);
    output.write(`}\n`);

    // recursively print unions as structs

    function printUnions (_fields) {
        const unions = _fields.filter(({ type }) => type === 'union');
        if (unions) {
            for (const union of unions) {
                for (const unionCase of union.cases) {
                    const moreTypes = printStructLike(output, {
                        name: `${name}${unionCase.type}`,
                        fields: unionCase.fields,
                    });
                    for (const type of moreTypes) {
                        usedTypes.add(type);
                    }
                }
            }
        }
    }

    printUnions(fields);
    return usedTypes;
}

module.exports = rust;
