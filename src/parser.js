const {CstParser} = require('chevrotain');
const {allTokens} = require('./lexer');

const [
    DocComment,
    Comment,
    Integer,
    DataType,
    Equals,
    Break,
    Comma,
    LCurly,
    RCurly,
    LSquare,
    RSquare,
    LParen,
    RParen,
    Add,
    Subtract,
    SubString,
    ServerPacket,
    ClientPacket,
    Enum,
    Struct,
    Union,
    CharacterValue,
    Colon,
    Identifier,
    BlankLine,
    EverythingElse,
] = allTokens;

class ProtocolParser extends CstParser {
    constructor() {
        super(allTokens);

        const $ = this;

        $.RULE('protocol', () => {
            $.MANY(() => {
                $.OR([
                    {ALT: () => $.SUBRULE($.enum)},
                    {ALT: () => $.SUBRULE1($.struct)},
                    {ALT: () => $.SUBRULE2($.serverPacket)},
                    {ALT: () => $.SUBRULE3($.clientPacket)},
                ]);
            })
        });

        $.RULE('enum', () => {
            $.OPTION(() => {
                $.CONSUME(DocComment);
            });
            $.CONSUME(Enum);
            $.CONSUME(Identifier);
            $.CONSUME(Colon);
            $.CONSUME(DataType);
            $.CONSUME(LCurly);
            $.MANY(() => {
                $.SUBRULE($.enumVariant);
            });
            $.CONSUME(RCurly);
        });

        $.RULE('enumVariant', () => {
            $.OR([
                {ALT: () => $.CONSUME(Identifier, {LABEL: 'EnumVariantValue'})},
                {ALT: () => $.CONSUME(Integer, {LABEL: 'EnumVariantValue'})},
            ])
            $.CONSUME1(Identifier, {LABEL: 'EnumVariantName'});
        });

        $.RULE('struct', () => {
            $.OPTION(() => {
                $.CONSUME(DocComment);
            });
            $.CONSUME(Struct);
            $.CONSUME(Identifier);
            $.CONSUME(LCurly);
            $.MANY(() => {
                $.SUBRULE($.field);
            });
            $.CONSUME(RCurly);
        });

        $.RULE('clientPacket', () => {
            $.OPTION(() => {
                $.CONSUME(DocComment);
            });
            $.CONSUME(ClientPacket);
            $.CONSUME(LParen);
            $.CONSUME(Identifier);
            $.CONSUME(Comma);
            $.CONSUME1(Identifier);
            $.CONSUME(RParen);
            $.CONSUME(LCurly);
            $.MANY(() => {
                $.SUBRULE($.field);
            });
            $.CONSUME(RCurly);
        });

        $.RULE('serverPacket', () => {
            $.OPTION(() => {
                $.CONSUME(DocComment);
            });
            $.CONSUME(ServerPacket);
            $.CONSUME(LParen);
            $.CONSUME(Identifier);
            $.CONSUME(Comma);
            $.CONSUME1(Identifier);
            $.CONSUME(RParen);
            $.CONSUME(LCurly);
            $.MANY(() => {
                $.SUBRULE($.field);
            });
            $.CONSUME(RCurly);
        });

        $.RULE('field', () => {
            $.OPTION(() => {
                $.CONSUME(DocComment);
            });
            $.OR([
                {ALT: () => $.SUBRULE($.normalField)},
                {ALT: () => $.SUBRULE($.structField)},
                {ALT: () => $.SUBRULE($.breakField)},
                {ALT: () => $.SUBRULE($.literalField)},
                {ALT: () => $.SUBRULE($.union)},
                {ALT: () => $.SUBRULE($.subString)},
            ]);
        })

        $.RULE('normalField', () => {
            $.OR([
                {ALT: () => $.CONSUME(DataType, {LABEL: 'FieldDataType'})},
                {ALT: () => $.CONSUME(Identifier, {LABEL: 'FieldDataType'})},
            ]);

            // Enum type
            $.OPTION(() => {
                $.CONSUME(Colon);
                $.CONSUME1(DataType, {LABEL: 'EnumDataType'});
            })

            // Fixed length
            $.OPTION1(() => {
                $.CONSUME(LParen);
                $.OR1([
                    {ALT: () => $.CONSUME(Integer, {LABEL: 'FixedLength'})},
                    {ALT: () => $.CONSUME1(Identifier, {LABEL: 'FixedLength'})},
                ]);
                $.OPTION2(() => {
                    $.OR2([
                        {ALT: () => $.CONSUME(Add, {LABEL: 'FixedLengthOperator'})},
                        {ALT: () => $.CONSUME1(Subtract, {LABEL: 'FixedLengthOperator'})},
                    ]);
                    $.OR3([
                        {ALT: () => $.CONSUME1(Integer, {LABEL: 'FixedLengthOffset'})},
                        {ALT: () => $.CONSUME2(Identifier, {LABEL: 'FixedLengthOffset'})},
                    ]);
                });
                $.CONSUME(RParen);
            })

            $.CONSUME3(Identifier, {LABEL: 'FieldName'});

            // Array
            $.OPTION3(() => {
                $.CONSUME(LSquare);

                // Optional length
                $.OPTION4(() => {
                    $.CONSUME2(Integer, {LABEL: 'ArrayLength'});
                });
                $.CONSUME(RSquare);
            });
        });

        $.RULE('structField', () => {
            $.CONSUME(Struct);

            // Struct name
            $.CONSUME(Identifier);

            // identifier
            $.CONSUME1(Identifier);

            // Array
            $.OPTION(() => {
                $.CONSUME(LSquare);

                // Optional length
                $.OPTION1(() => {
                    $.OR([
                        {ALT: () => $.CONSUME(Integer, {LABEL: 'ArrayLength'})},
                        {ALT: () => $.CONSUME2(Identifier, {LABEL: 'ArrayLength'})},
                    ])
                });

                $.CONSUME(RSquare);
            });
        });

        $.RULE('breakField', () => {
            $.CONSUME(Break);
        });

        $.RULE('literalField', () => {
            $.CONSUME(DataType);
            $.CONSUME(Equals);
            $.OR([
                {ALT: () => $.CONSUME(Integer)},
                {ALT: () => $.CONSUME(CharacterValue)},
            ]);
        });

        $.RULE('union', () => {
            $.CONSUME(Union)
            $.CONSUME(LParen);
            $.CONSUME(Identifier);
            $.CONSUME(RParen);
            $.CONSUME(LCurly);
            $.MANY(() => {
                $.SUBRULE($.unionCase);
            });
            $.CONSUME(RCurly);
        });

        $.RULE('unionCase', () => {
            $.CONSUME(Identifier);
            $.CONSUME(Colon);
            $.CONSUME1(Identifier);

            $.CONSUME(LCurly);
            $.MANY(() => {
                $.SUBRULE($.field);
            });
            $.CONSUME(RCurly);
        });

        $.RULE('subString', () => {
            $.CONSUME(SubString);
            $.CONSUME(LParen);
            $.CONSUME(Identifier, {LABEL: 'String'});
            $.CONSUME(Comma);
            $.OR([
                {ALT: () => $.CONSUME(Integer, {LABEL: 'SubStringStart'})},
                {ALT: () => $.CONSUME1(Identifier, {LABEL: 'SubStringStart'})},
            ]);
            $.OPTION(() => {
                $.CONSUME2(Comma);
                $.OR1([
                    {ALT: () => $.CONSUME1(Integer, {LABEL: 'SubStringLength'})},
                    {ALT: () => $.CONSUME2(Identifier, {LABEL: 'SubStringLength'})},
                ]);
            });
            $.CONSUME(RParen);
            $.CONSUME3(Identifier, {LABEL: 'FieldName'});
        })

        this.performSelfAnalysis();
    }
}

const parser = new ProtocolParser();

module.exports = parser;
