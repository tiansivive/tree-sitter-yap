/**
 * @file A parser for the Yap language
 * @author Tiago Vila Verde
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PRECEDENCE = {
  projection: 70,  // field access, highest precedence
  application: 60,
  arithmetic: {
    multiplicative: 54,
    additive: 53,
    concat: 52,
    relational: 51  // comparisons: ==, !=, <, >, <=, >=
  },
  logical: {
    and: 42,
    or: 41
  },
  types: {
    annotation: 32,  // higher than pipelines for intermediate annotations
    modal: 31
  },
  control: {
    pipeline: 22,
    continuations: 21  // shift, reset, resume
  },
  syntactic: {
    arrow: 11,  // lambda, pi, mu - right-associative binding forms
    tag: 11     // tagged constructors - right-associative
  }
};

module.exports = grammar({
  name: 'yap',

  conflicts: $ => [
    [$.struct, $.block],
    [$.variable, $.key],
    [$.row, $.list],
    [$.type, $.injection],
    [$.modal_type],
    [$.variant],
    [$.match],
    [$.list, $.dict],
    [$.pattern_list, $.pattern_row]
  ],

  extras: $ => [
    /\s/,
    $.comment
  ],

  word: $ => $.identifier,

  supertypes: $ => [
    $.type,
    $.expr,
    $.pattern,
    $.atom,
    $.statement
  ],

  rules: {
    // Entry points
    source_file: $ => choice(
      $.module,
      $.script
    ),

    module: $ => seq(
      $.exports,
      repeat($.import),
      $.script
    ),

    script: $ => seq(
      $.statement,
      repeat(seq(';', $.statement)),
      optional(';')
    ),

    // Exports
    exports: $ => choice(
      seq('export', '*', ';'),
      seq('export', '(', commaSep($.identifier), ')', ';')
    ),

    // Imports
    import: $ => choice(
      seq('import', $.string, ';'),
      seq('import', $.string, '(', commaSep($.identifier), ')', ';')
    ),

    // Statements
    statement: $ => choice(
      $.letdec,
      $.using,
      $.foreign,
      $.expr
    ),

    letdec: $ => choice(
      seq('let', field('name', $.identifier), '=', field('value', $.expr)),
      seq('let', field('name', $.identifier), ':', field('type', $.type), '=', field('value', $.expr))
    ),

    using: $ => seq(
      'using',
      $.ann,
      optional(seq('as', $.identifier))
    ),

    foreign: $ => seq(
      'foreign',
      $.identifier,
      ':',
      $.type
    ),



    // Types (unified)
    type: $ => choice(
      $.pi,
      $.mu,
      $.variant,
      $.dict,
      $.row,
      $.modal_type,
      $.expr,
      $.ann
    ),

    // Annotations
    ann: $ => prec.right(PRECEDENCE.types.annotation, seq($.type, ':', $.type)),

    modal_type: $ => choice(
      prec(PRECEDENCE.types.modal, seq('<', $.quantity, '>', $.type, '[|', $.lambda, '|]')),
      prec(PRECEDENCE.types.modal, seq('<', $.quantity, '>', $.type)),
      prec(PRECEDENCE.types.modal, seq($.type, '[|', $.lambda, '|]'))
    ),

    mu: $ => prec.right(PRECEDENCE.syntactic.arrow, seq('μ', field('name', $.identifier), '->', field('body', $.type))),

    // Expressions (unified with operator precedence)
    expr: $ => choice(
      $.lambda,
      $.match,
      $.block,
      $.reset,
      $.shift,
      $.resume,
      $.operation,
      $.application,
      $.atom
    ),

    // Application (highest precedence)
    application: $ => choice(
      prec.left(PRECEDENCE.application, seq(field('function', $.expr), field('argument', $.atom))),
      prec.left(PRECEDENCE.application, seq(field('function', $.expr), '@', field('argument', $.atom)))
    ),

    // Operation (lower precedence than application)
    operation: $ => choice(
      prec.left(PRECEDENCE.arithmetic.multiplicative, seq($.expr, choice('*', '/', '%'), $.expr)),
      prec.left(PRECEDENCE.arithmetic.additive, seq($.expr, choice('+', '-'), $.expr)),
      prec.left(PRECEDENCE.arithmetic.concat, seq($.expr, choice('<>', '++'), $.expr)),
      prec.left(PRECEDENCE.arithmetic.relational, seq($.expr, choice('==', '!=', '<=', '>=', '<', '>'), $.expr)),
      prec.left(PRECEDENCE.control.pipeline, seq($.expr, choice('|>', '<|'), $.expr)),
      prec.left(PRECEDENCE.logical.and, seq($.expr, '&&', $.expr)),
      prec.left(PRECEDENCE.logical.or, seq($.expr, '||', $.expr))
    ),

    // Atoms
    atom: $ => choice(
      $.variable,
      $.hole,
      $.literal,
      $.struct,
      $.tuple,
      $.projection,
      $.injection,
      $.list,
      $.tagged,
      $.parenthesized
    ),

    parenthesized: $ => seq('(', $.type, ')'),

    variable: $ => choice(
      $.identifier,
      $.label
    ),

    hole: $ => '_',

    label: $ => seq(':', $.identifier),

    // Literals
    literal: $ => choice(
      $.string,
      $.number,
      $.boolean,
      'Type',
      'Unit',
      '!',
      'Row'
    ),

    string: $ => /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*"/,

    number: $ => token(choice(
      seq(/[0-9]+/, '.', /[0-9]+/),
      /[0-9]+/
    )),

    boolean: $ => choice('true', 'false'),

    // Lambda
    lambda: $ => prec.right(PRECEDENCE.syntactic.arrow, choice(
      seq('\\', field('params', repeat1($.param)), '->', field('body', $.type)),
      seq('\\', field('params', repeat1($.param)), '=>', field('body', $.type))
    )),

    param: $ => choice(
      $.identifier,
      seq('(', $.typed_param, ')')
    ),

    typed_param: $ => seq($.identifier, ':', $.type),

    // Pi types (right-associative)
    pi: $ => choice(
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', $.type), '->', field('codomain', $.type))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', $.type), '=>', field('codomain', $.type)))
    ),

    // Row terms
    row: $ => seq('[', commaSep($.key_value), optional(seq('|', $.identifier)), ']'),

    key_value: $ => seq($.key, ':', $.type),

    key: $ => choice(
      $.identifier,
      /[0-9]+/
    ),

    // Struct
    struct: $ => choice(
      seq('{', '}'),
      seq('{', commaSep($.key_value), optional(seq('|', $.identifier)), '}')
    ),

    // Tuple
    tuple: $ => seq('{', commaSep1($.type), optional(seq('|', $.identifier)), '}'),

    // List
    list: $ => choice(
      seq('[', ']'),
      seq('[', commaSep1($.type), optional(seq('|', $.identifier)), ']')
    ),

    // Variant
    variant: $ => seq('|', sep1($.tagged, '|')),

    // Tagged
    tagged: $ => prec.right(PRECEDENCE.syntactic.tag, seq('#', field('tag', $.identifier), field('payload', $.type))),

    // Dict
    dict: $ => seq('{', '[', $.type, ']', ':', $.type, '}'),

    // Projection
    projection: $ => choice(
      prec.left(PRECEDENCE.projection, seq(field('record', $.atom), '.', field('key', $.identifier))),
      seq('.', field('key', $.identifier))
    ),

    // Injection
    injection: $ => choice(
      seq('{', field('record', $.expr), '|', field('updates', commaSep($.assignment)), '}'),
      seq('{', '|', field('updates', commaSep($.assignment)), '}')
    ),

    assignment: $ => seq(field('key', $.identifier), '=', field('value', $.type)),

    // Block
    block: $ => choice(
      seq('{', field('statements', repeat(seq($.statement, ';'))), optional(field('return', $.return_statement)), '}'),
      seq('{', field('return', $.return_statement), '}')
    ),

    return_statement: $ => seq('return', field('value', $.ann), ';'),

    // Pattern matching
    match: $ => seq('match', field('subject', $.type), repeat1(field('branch', $.alternative))),

    alternative: $ => seq('|', field('pattern', $.pattern), '->', field('body', $.type)),

    pattern: $ => choice(
      $.pattern_variable,
      $.pattern_literal,
      $.pattern_tagged,
      $.pattern_struct,
      $.pattern_tuple,
      $.pattern_list,
      $.pattern_row,
      $.wildcard
    ),

    pattern_variable: $ => $.identifier,

    pattern_literal: $ => $.literal,

    pattern_tagged: $ => prec.right(PRECEDENCE.syntactic.tag, seq('#', field('tag', $.identifier), field('payload', $.pattern))),

    pattern_struct: $ => choice(
      seq('{', '}'),
      seq('{', commaSep($.pattern_key_value), optional(seq('|', $.identifier)), '}')
    ),

    pattern_tuple: $ => seq('{', commaSep1($.pattern), optional(seq('|', $.identifier)), '}'),

    pattern_list: $ => choice(
      seq('[', ']'),
      seq('[', commaSep1($.pattern), optional(seq('|', $.identifier)), ']')
    ),

    pattern_row: $ => seq('[', commaSep($.pattern_key_value), optional(seq('|', $.identifier)), ']'),

    pattern_key_value: $ => seq($.identifier, ':', $.pattern),

    wildcard: $ => '_',

    // Delimited continuations (right-associative)
    reset: $ => prec.right(PRECEDENCE.control.continuations, seq('reset', $.type)),

    shift: $ => prec.right(PRECEDENCE.control.continuations, seq('shift', $.type)),

    resume: $ => prec.right(PRECEDENCE.control.continuations, seq('resume', $.type)),

    // Modalities
    quantity: $ => choice('0', '1', '*'),

    // Identifiers
    identifier: $ => /[a-zA-Z][a-zA-Z0-9]*/,

    comment: $ => token(choice(
      seq('//', /.*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')
    ))
  }
});

/**
 * Creates a rule to match one or more of the rules separated by a separator
 * @param {Rule} rule
 * @param {string} separator
 * @return {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 * @param {Rule} rule
 * @return {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 * @param {Rule} rule
 * @return {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}