function strip(cst) {
    const protocol = {
        enums: [],
        structs: [],
        clientPackets: [],
        serverPackets: [],
    };

    for (const enumCst of cst.children.enum) {
        const comment = enumCst.children['DocComment']?.[0]?.image;
        const name = enumCst.children['Identifier'][0]?.image;
        const dataType = enumCst.children['DataType'][0]?.image;
        const variants = {};
        enumCst.children['enumVariant'].forEach(variantCst => {
            let value = variantCst.children['EnumVariantValue'][0].image;
            if (!isNaN(value)) {
                value = parseInt(value, 10);
            }
            const variantName = variantCst.children['EnumVariantName'][0].image;
            variants[value] = variantName;
        });
        protocol.enums.push({
            comment,
            name,
            dataType,
            variants,
        });
    }

    for (const structCst of cst.children.struct) {
        const comment = structCst.children['DocComment']?.[0]?.image;
        const name = structCst.children['Identifier'][0]?.image;
        const fields = structCst.children['field'].map(stripField);
        protocol.structs.push({
            comment: trimComment(comment),
            name,
            fields,
        });
    }

    for (const packetCst of cst.children.clientPacket) {
        const comment = packetCst.children['DocComment']?.[0]?.image;
        const family = packetCst.children['Identifier'][0]?.image;
        const action = packetCst.children['Identifier'][1]?.image;
        const fields = packetCst.children['field']?.map(stripField);
        protocol.clientPackets.push({
            comment: trimComment(comment),
            family,
            action,
            fields,
        });
    }

    for (const packetCst of cst.children.serverPacket) {
        const comment = packetCst.children['DocComment']?.[0]?.image;
        const family = packetCst.children['Identifier'][0]?.image;
        const action = packetCst.children['Identifier'][1]?.image;
        const fields = packetCst.children['field']?.map(stripField);
        protocol.serverPackets.push({
            comment: trimComment(comment),
            family,
            action,
            fields,
        });
    }

    return protocol;
}

function trimComment(comment) {
    return comment?.substr(1, comment.length - 2);
}

function stripField (fieldCst) {
    const comment = fieldCst.children['DocComment']?.[0]?.image;
    const normalField = fieldCst.children['normalField'];
    const structField = fieldCst.children['structField'];
    const breakField = fieldCst.children['breakField'];
    const literalField = fieldCst.children['literalField'];
    const union = fieldCst.children['union'];
    const fn = fieldCst.children['function'];

    switch (true) {
        case !!normalField:
            return {...stripNormalField(normalField[0]), comment};
        case !!structField:
            return {...stripStructField(structField[0]), comment};
        case !!breakField:
            return stripBreakField(breakField[0]);
        case !!literalField:
            return {...stripLiteralField(literalField[0]), comment};
        case !!union:
            return stripUnion(union[0]);
        default:
            throw new Error('Unknown field type');
            return undefined;
    }
}

function stripNormalField(fieldCst) {
    const type = fieldCst.children['FieldDataType'][0]?.image;
    const name = fieldCst.children['FieldName'][0]?.image;
    const enumDataType = fieldCst.children['EnumDataType']?.[0]?.image;
    const fixedLength = Number(fieldCst.children['FixedLength']?.[0]?.image) || fieldCst.children['FixedLength']?.[0]?.image || undefined;
    const arrayLength = Number(fieldCst.children['ArrayLength']?.[0]?.image) || fieldCst.children['ArrayLength']?.[0]?.image || undefined;
    const isArray = !!fieldCst.children['LSquare'];

    return {
        name,
        type,
        enumDataType,
        fixedLength,
        arrayLength,
        isArray,
    };
}

function stripStructField(fieldCst) {
    const struct = fieldCst.children['Identifier'][0]?.image;
    const name = fieldCst.children['Identifier'][1]?.image;
    const isArray = !!fieldCst.children['LSquare'];
    const arrayLength = fieldCst.children['ArrayLength']?.[0]?.image || undefined;

    return {
        type: 'struct',
        name,
        struct,
        isArray,
        arrayLength: isNaN(arrayLength) ? arrayLength : Number(arrayLength),
    };
}

function stripBreakField() {
    return "BREAK";
}

function stripLiteralField(fieldCst) {
    const type = fieldCst.children['DataType'][0]?.image;
    const value = fieldCst.children['Integer']?.[0]?.image ||
        fieldCst.children['CharacterValue']?.[0]?.image;

    return {
        type,
        value,
    };
}

function stripUnion(fieldCst) {
    const variable = fieldCst.children['Identifier'][0]?.image;
    const cases = fieldCst.children['unionCase'].map(stripUnionCase);

    return {
        type: 'union',
        variable,
        cases,
    }
}

function stripUnionCase(caseCst) {
    const type = caseCst.children['Identifier'][0]?.image;
    const name = caseCst.children['Identifier'][1]?.image;
    const fields = caseCst.children['field']?.map(stripField);

    return {
        type,
        name,
        fields,
    }
}

function stripFunction(fieldCst) {
    const returnType = fieldCst.children['ReturnType'][0]?.image;
    const params = fieldCst.children['ParameterType']?.map((paramCst, index) => {
        return {
            type: paramCst.image,
            name: fieldCst.children['ParameterName'][index].image,
        }
    });

    const name = fieldCst.children['FunctionName'][0]?.image;
    const isStatic = !!fieldCst.children['Static'];
    const isConst = !!fieldCst.children['Const'];

    const statements = fieldCst.children['statement'].map(stripStatement);

    return {
        type: 'function',
        name,
        returnType,
        params,
        isStatic,
        isConst,
        statements,
    }
}

function stripStatement(statementCst) {
    const assignment = statementCst.children['assignment'];
    const returnStatement = statementCst.children['return'];
    const increment = statementCst.children['increment'];

    if (assignment) {
        const dataType = assignment[0].children['DataType'][0]?.image;
        const variable = assignment[0].children['Identifier'][0]?.image;
        const expressions = assignment[0].children['expression'].map(stripExpression);

        if (dataType) {
            return `${dataType} ${variable} = ${expressions.join(' ')};`;
        }

        return `${variable} = ${expressions.join(' ')};`;
    }

    if (returnStatement) {
        const expressions = returnStatement[0].children['expression'].map(stripExpression);
        return `return ${expressions.join(' ')};`;
    }

    if (increment) {
        const variable = increment[0].children['Identifier'][0]?.image;
        return `${variable}++;`;
    }
}

function stripExpression(expressionCst) {
    if (expressionCst.children['cast']) {
        return stripCast(expressionCst.children['cast'][0]);
    }

    const keys = Object.keys(expressionCst.children);
    const value = expressionCst.children[keys[0]][0].image;
    return value;
}

function stripCast(castCst) {
    const dataType = castCst.children['Identifier'][0]?.image;
    const variable = castCst.children['Identifier'][1]?.image;
    return `${dataType}(${variable})`;
}

module.exports = strip;
