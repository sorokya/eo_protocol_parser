const chevrotain = require('chevrotain');
const Lexer = chevrotain.Lexer;
const createToken = chevrotain.createToken;

const DataType = createToken({
    name: 'DataType',
    pattern: /byte\b|char\b|short\b|three\b|int\b|string\b|raw_string\b|eo2_uint\b/,
});

const Break = createToken({
    name: 'Break',
    pattern: /break/,
});

const Integer = createToken({
    name: 'Integer',
    pattern: /0|[1-9]\d*/,
});

const Equals = createToken({
    name: 'Equals',
    pattern: /=/,
});

const CharacterValue = createToken({
    name: 'CharacterValue',
    pattern: /'([^']|\\')'/,
});

const Comma = createToken({
    name: 'Comma',
    pattern: /,/,
});

const Comment = createToken({
    name: 'Comment',
    pattern: /\/\/.*/,
    group: Lexer.SKIPPED,
});

const DocComment = createToken({
    name: 'DocComment',
    pattern: /"([^"]|\\")*"/,
});

const Enum = createToken({
    name: 'Enum',
    pattern: /enum/,
});

const Struct = createToken({
    name: 'Struct',
    pattern: /struct/,
});

const Union = createToken({
    name: 'Union',
    pattern: /union/,
});

const Colon = createToken({
    name: 'Colon',
    pattern: /:/,
});

const ServerPacket = createToken({
    name: 'ServerPacket',
    pattern: /server_packet/,
});

const ClientPacket = createToken({
    name: 'ClientPacket',
    pattern: /client_packet/,
});

const Add = createToken({
    name: 'Add',
    pattern: /\+/,
});

const Subtract = createToken({
    name: 'Subtract',
    pattern: /\-/,
});

const SubString = createToken({
    name: 'SubString',
    pattern: /sub_string/,
});

const LCurly = createToken({ name: "LCurly", pattern: /{/ })
const RCurly = createToken({ name: "RCurly", pattern: /}/ })
const LSquare = createToken({ name: "LSquare", pattern: /\[/ })
const RSquare = createToken({ name: "RSquare", pattern: /]/ })
const LParen = createToken({ name: "LParen", pattern: /\(/ })
const RParen = createToken({ name: "RParen", pattern: /\)/ })

const Identifier = createToken({ name: "Identifier", pattern: /[a-zA-Z_]\w*/ })

const BlankLine = createToken({
    name: 'BlankLine',
    pattern: /\s*\n/,
    group: Lexer.SKIPPED,
});

const EverythingElse = createToken({
    name: 'EverythingElse',
    pattern: /./,
    group: Lexer.SKIPPED,
});

const allTokens = [
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
];

const ProtocolLexer = new Lexer(allTokens);

module.exports = {
    allTokens,

    lex: function (inputText) {
        const lexResult = ProtocolLexer.tokenize(inputText);

        if (lexResult.errors.length > 0) {
            throw new Error('sad sad panda, lexing errors detected')
        }

        return lexResult;
    }
}