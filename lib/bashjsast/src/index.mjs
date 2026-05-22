/**
 * bashjsast — Bash AST parser for JavaScript
 *
 * parse(src)           → plain dict AST
 * print(ast)           → canonical bash text
 * printAsFunction(n,a) → bash `type` format
 * query(src)           → BashQuery (structured extraction)
 * Lexer                → tokenizer
 * T                    → token type constants
 */

export { Lexer, T } from './lexer.mjs'
export { parse } from './parser.mjs'
export { print, printAsFunction } from './printer.mjs'
export { query, BashQuery } from './query.mjs'
