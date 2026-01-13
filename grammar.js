/**
 * @file A parser for the Yap language
 * @author Tiago Vila Verde
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const IDENTIFIER_PATTERN = /[a-zA-Z_][a-zA-Z0-9_']*/;

const PRECEDENCE = {

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
    modal: {
      multiple: 32,
      single: 31
    }
  },
  control: {
    pipeline: 22,
    continuations: 21  // shift, reset, resume
  },
  syntactic: {
    field: 80,
    injection: 71,    // record update
    projection: 70,   // field access, highest precedence
    tail: 62,         // row/struct/list tail
    unary: 61,        // unary prefix operators
    application: 60,
    arrow: 13,        // arrow, pi, lambda, mu - right-associative binding forms
    tag: 12,          // tagged constructors - right-associative
    key: 11,
    base: 10,
  }
};

module.exports = grammar({
  name: 'yap',

  conflicts: $ => [
    [$.struct, $.block],
    [$.pattern_list, $.pattern_row],
  ],

  extras: $ => [
    /\s/,
    $.comment
  ],

  word: $ => $.identifier,

  supertypes: $ => [
    $.type_expr,
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
      seq('export', '(', sep1($.identifier, ','), ')', ';')
    ),

    // Imports
    import: $ => choice(
      seq('import', $.string, ';'),
      seq('import', $.string, '(', sep1($.identifier, ','), ')', ';')
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
      seq('let', field('name', $.identifier), ':', field('type', $.expr), '=', field('value', $.expr))
    ),

    using: $ => seq(
      'using',
      $.expr,
      optional(seq('as', $.identifier))
    ),

    foreign: $ => seq(
      'foreign',
      $.identifier,
      ':',
      $.expr
    ),

    


    // Types (unified)
    type_expr: $ => choice(
      $.pi,
      $.arrow,
      $.mu,
      $.variant,
      $.dict,
      $.modal,
    ),
    
    modal: $ => choice(
      prec.right(PRECEDENCE.types.modal.multiple, seq('<', $.quantity, '>', $.expr, '[|', $.lambda, '|]')),
      prec.right(PRECEDENCE.types.modal.single, seq('<', $.quantity, '>', $.expr)),
      prec.right(PRECEDENCE.types.modal.single, seq($.expr, '[|', $.lambda, '|]'))
    ),

    mu: $ => prec.right(PRECEDENCE.syntactic.arrow, seq('μ', field('name', $.identifier), '->', field('body', $.expr))),
    // Expressions (unified with operator precedence)
    expr: $ => choice(
      $.type_expr,
      $.lambda,
      $.match,
      $.block,
      $.unary,
      $.operation,
      $.application,
      $.annotation,
      $.atom,
    ),

            // Annotations
    annotation: $ => prec.right(PRECEDENCE.syntactic.base, seq($.expr, ':', $.expr)),

    // Unary operations (prefix)
    unary: $ => prec.right(PRECEDENCE.syntactic.unary, seq(choice('-', '+'), $.expr)),

    // Application (highest precedence)
    application: $ => choice(
      prec.left(PRECEDENCE.syntactic.application, seq(field('function', $.expr), field('argument', $.atom))),
      prec.left(PRECEDENCE.syntactic.application, seq(field('function', $.expr), alias('@', $.implicit_application), field('argument', $.atom)))
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
      $.row,
      $.list,
      $.tagged,
      $.reset,
      $.shift,
      $.resume,
      $.parenthesized
    ),

    parenthesized: $ => parens($.expr),
    

    variable: $ => choice(
      $.identifier,
      $.label
    ),

    hole: $ => '?',

    // Identifiers
    identifier: $ => IDENTIFIER_PATTERN,
    label: $ => token(new RegExp(":" + IDENTIFIER_PATTERN.source)),

    // Literals
    literal: $ => choice(
      $.string,
      $.number,
      $.boolean,
      'Type',
      'Unit',
      'Row',
      '!',
    ),

    string: $ => /"(?:\\["bfnrt\/\\]|\\u[a-fA-F0-9]{4}|[^"\\])*"/,

    _digits: $ => token(/[0-9]+/),
    number: $ => choice(
      prec.right(1, seq($._digits, '.', $._digits)),
      $._digits
    ),

    boolean: $ => choice('true', 'false'),

        // Pi types (right-associative, domain must be (identifier: type))
    pi: $ => choice(
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', parens(sep1($.typing, ","))), alias('->', $.explicit_arrow), field('codomain', $.expr))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', parens(sep1($.typing, ","))), alias('=>', $.implicit_arrow), field('codomain', $.expr)))
    ),

    // Simple arrow types (right-associative)
    arrow: $ => choice(
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', parens(sep1($.expr, ","))), alias('->', $.explicit_arrow), field('codomain', $.expr))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', $.expr), alias('->', $.explicit_arrow), field('codomain', $.expr))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', parens(sep1($.expr, ","))), alias('=>', $.implicit_arrow), field('codomain', $.expr))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', $.expr), alias('=>', $.implicit_arrow), field('codomain', $.expr)))
    ),

    // domain: $ => prec.right(1, choice(
    //   $.typing,
    //   $.expr
    // )),

    // Lambda
    lambda: $ => prec.right(choice(
      seq('\\', field('params', $.params), alias('->', $.explicit_arrow), field('body', $.expr)),
      seq('\\', field('params', $.params), alias('=>', $.implicit_arrow), field('body', $.expr))
    )), 

    params: $ => choice(
      repeat1($.param),
      parens(sep1($.param, ','))
    ),

    param: $ => choice(
      $.identifier,
     parens($.typing)
    ),

    typing: $ => prec.right(PRECEDENCE.syntactic.base, seq($.identifier, ':', $.expr)),


    // Row terms
    row: $ => seq('[', sep1($.key_value, ','), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), ']'),

    // Redefine key_value to have higher precedence over plain expressions
    key_value: $ => prec.right(PRECEDENCE.syntactic.field, seq($.key, ':', $.expr)),
    key: $ => prec.right(PRECEDENCE.syntactic.key, choice(
      alias($.identifier, $.field),
      alias($._digits, $.index)
    )),

    //index: $ => token(/[0-9]+/),
    
    // Struct
    struct: $ => choice(
      seq('{', '}'),
      seq('{', sep1($.key_value, ','), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), '}')
    ),
    // Tuple
    tuple: $ => seq('{', sep1($.expr, ','), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), '}'),
    
    // List
    list: $ => choice(
      seq('[', ']'),
      seq('[', sep1($.expr, ','), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), ']')
    ),

    // Variant
    variant: $ => prec.right(PRECEDENCE.syntactic.base, seq('|', sep1($.tagged, '|'))),

    // Tagged
    tagged: $ => prec.right(PRECEDENCE.syntactic.tag, seq('#', field('tag', $.identifier), field('payload', $.expr))),

    // Dict
    dict: $ => prec.right(PRECEDENCE.syntactic.base, seq('{', '[', $.expr, ']', ':', $.expr, '}')),

    // Projection
    projection: $ => choice(
      prec.left(PRECEDENCE.syntactic.projection, seq(field('record', $.atom), '.', field('key', $.identifier))),
      seq('.', field('key', $.identifier))
    ),

    // Injection
    injection: $ => choice(
      prec.right(PRECEDENCE.syntactic.injection, seq('{', field('record', $.expr), '|', field('updates', sep1($.assignment, ',')), '}')),
      prec.right(PRECEDENCE.syntactic.injection, seq('{', '|', field('updates', sep1($.assignment, ',')), '}'))
    ),

    assignment: $ => seq(field('key', $.identifier), '=', field('value', $.expr)),

    // Block
    block: $ => choice(
      seq('{', field('statements', repeat(seq($.statement, ';'))), optional(field('return', $.return_statement)), '}'),
      seq('{', field('return', $.return_statement), '}')
    ),

    return_statement: $ => seq('return', field('value', $.expr), ';'),

    // Pattern matching
    match: $ => prec.right(PRECEDENCE.syntactic.base, seq('match', field('subject', $.expr), repeat1(field('branch', $.alternative)))),

    alternative: $ => prec.right(seq('|', field('pattern', $.pattern), '->', field('body', $.expr))),

    pattern: $ => choice(
      $.variable,
      $.literal,
      $.pattern_tagged,
      $.pattern_struct,
      $.pattern_tuple,
      $.pattern_list,
      $.pattern_row,
      $.wildcard
    ),


    pattern_tagged: $ => prec.right(PRECEDENCE.syntactic.tag, seq('#', field('tag', $.identifier), field('payload', $.pattern))),

    pattern_struct: $ => choice(
      seq('{', optional(seq('|', $.identifier)),'}'),
      seq('{', sep1($.pattern_key_value, ','), prec.right(PRECEDENCE.syntactic.base, optional(seq('|', $.identifier))), '}')
    ),

    pattern_tuple: $ => seq('{', sep1($.pattern, ','), prec.right(PRECEDENCE.syntactic.base, optional(seq('|', $.identifier))), '}'),

    pattern_list: $ => choice(
      seq('[', ']'),
      seq('[', sep1($.pattern, ','), prec.right(PRECEDENCE.syntactic.base, optional(seq('|', $.identifier))), ']')
    ),

    pattern_row: $ => seq('[', commaSep($.pattern_key_value), prec.right(PRECEDENCE.syntactic.base, optional(seq('|', $.identifier))), ']'),

    pattern_key_value: $ => seq($.identifier, ':', $.pattern),

    wildcard: $ => '_',

    // Delimited continuations (right-associative)
    reset: $ => prec.right(PRECEDENCE.control.continuations, seq('reset', $.expr)),

    shift: $ => prec.right(PRECEDENCE.control.continuations, seq('shift', $.expr)),

    resume: $ => prec.right(PRECEDENCE.control.continuations, seq('resume', $.expr)),
    // Modalities
    quantity: $ => choice('0', '1', '*'),



    



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
 * Creates a rule to optionally match one or more of the rules separated by a comma
 * @param {Rule} rule
 * @return {ChoiceRule}
 */
function commaSep(rule) {
  return optional(sep1(rule, ','));
}

/**
 * 
 * @param {Rule} rule 
 * @returns {SeqRule}
 */
function parens(rule) {
  return seq('(', rule, ')');
}

