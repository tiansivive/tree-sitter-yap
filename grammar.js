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
    domain: 11,      // domain in pi/arrow types - same as key as it's kinda similar. eg. (x: T) vs { x: v }. there should be no conflict though
    base: 10,
  }
};

module.exports = grammar({
  name: 'yap',

  conflicts: $ => [
    [$.struct, $.block],
    [$.pattern_list, $.pattern_row],
    // [$.annotation, $.arrdomain]
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
    $.statement,
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
      $.type_expr
    ),

    letdec: $ => choice(
      seq('let', field('name', $.identifier), '=', field('value', $.type_expr)),
      seq('let', field('name', $.identifier), ':', field('type', $.type_expr), '=', field('value', $.type_expr))
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
      $.type_expr
    ),

    


    // Types (unified)
    type_expr: $ => choice(
      $.pi,
      $.arrow,
      $.mu,
      $.variant,
      $.modal,
      $.expr
    ),
    
    modal: $ => choice(
      prec.right(PRECEDENCE.types.modal.multiple, seq('<', $.quantity, '>', $.expr, '[|', $.lambda, '|]')),
      prec.right(PRECEDENCE.types.modal.single, seq('<', $.quantity, '>', $.expr)),
      prec.right(PRECEDENCE.types.modal.single, seq($.expr, '[|', $.lambda, '|]'))
    ),

    mu: $ => prec.right(PRECEDENCE.syntactic.arrow, seq('μ', field('name', $.identifier), '->', field('body', $.type_expr))),
    // Expressions (unified with operator precedence)
    expr: $ => choice(
      $.lambda,
      $.match,
      $.unary,
      $.operation,
      $.application,
      $.annotation,
      $.atom,
    ),

            // Annotations
    annotation: $ => prec.right(PRECEDENCE.syntactic.base, seq(
      field('expr', $.expr),
      ':',
      field('type', $.type_expr)
    )),

    // Unary operations (prefix)
    unary: $ => prec.right(PRECEDENCE.syntactic.unary, seq(field('operator', choice('-', '+')), field('operand', $.expr))),

   
    application: $ => choice(
      prec.right(PRECEDENCE.syntactic.application, seq(field('function', $.atom), field("argument", repeat1($.argument)))),
      // prec.right(PRECEDENCE.syntactic.application, seq(field('function', $.expr), repeat1(field('argument', field("implicit", seq('@', $.atom))))))
    ),

    argument: $ => choice(
      field("explicit", $.atom),
      seq('@', field("implicit", $.atom))
    ),

    // Operation (lower precedence than application)
    operation: $ => choice(
      prec.left(PRECEDENCE.arithmetic.multiplicative, seq(field('left', $.expr), field('operator', choice('*', '/', '%')), field('right', $.expr))),
      prec.left(PRECEDENCE.arithmetic.additive, seq(field('left', $.expr), field('operator', choice('+', '-')), field('right', $.expr))),
      prec.left(PRECEDENCE.arithmetic.concat, seq(field('left', $.expr), field('operator', choice('<>', '++')), field('right', $.expr))),
      prec.left(PRECEDENCE.arithmetic.relational, seq(field('left', $.expr), field('operator', choice('==', '!=', '<=', '>=', '<', '>')), field('right', $.expr))),
      prec.left(PRECEDENCE.control.pipeline, seq(field('left', $.expr), field('operator', choice('|>', '<|')), field('right', $.expr))),
      prec.left(PRECEDENCE.logical.and, seq(field('left', $.expr), field('operator', alias('&&', $.and)), field('right', $.expr))),
      prec.left(PRECEDENCE.logical.or, seq(field('left', $.expr), field('operator', alias('||', $.or)), field('right', $.expr)))
    ),

    // Atoms
    atom: $ => choice(
      $.variable,
      $.hole,
      $.literal,
      $.dict,
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
      $.parenthesized,
      $.block,
    ),

    parenthesized: $ => parens($.type_expr),
    

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
      alias('Type', $.TypeOfTypes),
      alias('Unit', $.Unit),
      alias('Row', $.Row),
      alias('!', $.Bang),
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
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', alias($.pidomain, $.domain)), field("icit", alias('->', $.explicit)), field('codomain', $.type_expr))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', alias($.pidomain, $.domain)), field("icit", alias('=>', $.implicit)), field('codomain', $.type_expr)))
    ),

    // Simple arrow types (right-associative)
    arrow: $ => choice(
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', alias($.arrdomain, $.domain)), field("icit", alias('->', $.explicit)), field('codomain', $.type_expr))),
      // prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', $.expr), alias('->', $.explicit_arrow), field('codomain', $.expr))),
      prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', alias($.arrdomain, $.domain)), field("icit", alias('=>', $.implicit)), field('codomain', $.type_expr))),
      // prec.right(PRECEDENCE.syntactic.arrow, seq(field('domain', $.expr), alias('=>', $.implicit_arrow), field('codomain', $.expr)))
    ),

    pidomain: $ => prec.right(PRECEDENCE.syntactic.domain, parens(buildDomain(field("param", $.typing)))),
    arrdomain: $ => choice(
      prec.right(PRECEDENCE.syntactic.domain, parens(buildDomain(field("param", $.type_expr)))),

      // Nesting must be explicit with parentheses
      // Eg. A -> B -> C must be parsed as A -> (B -> C)
      // (A -> B) -> C must be written as (A -> B) -> C
      // If type_expr were used, it would cause the parser to interpret it as left-associative
      prec.right(PRECEDENCE.syntactic.domain, field("param", $.expr))
    ),

    // Lambda
    lambda: $ => prec.right(PRECEDENCE.syntactic.base, choice(
      seq('\\', field('params', $.params), field("icit", alias('->', $.explicit)), field('body', $.type_expr)),
      seq('\\', field('params', $.params), field("icit", alias('=>', $.implicit)), field('body', $.type_expr))
    )), 

    params: $ => choice(
      repeat1($.param),
      parens(sep1($.param, ','))
    ),

    param: $ => choice(
      $.identifier,
     parens($.typing)
    ),

    typing: $ => prec.right(PRECEDENCE.syntactic.base, seq($.identifier, ':', $.type_expr)),


    // Row terms
    row: $ => seq('[', field('field', sep1($.key_value, ',')), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), ']'),

    // Redefine key_value to have higher precedence over plain expressions
    key_value: $ => prec.right(PRECEDENCE.syntactic.field, seq(field('key', $.key), ':', field('value', $.type_expr))),
    key: $ => prec.right(PRECEDENCE.syntactic.key, choice(
      alias($.identifier, $.field),
      alias($._digits, $.index)
    )),

    //index: $ => token(/[0-9]+/),
    
    // Struct
    struct: $ => choice(
      seq('{', '}'),
      seq('{', field('field', sep1($.key_value, ',')), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), '}')
    ),
    // Tuple
    tuple: $ => seq('{', field('element', sep1($.type_expr, ',')), prec.right(PRECEDENCE.syntactic.tail, optional(field("tail", seq('|', $.identifier)))), '}'),
    
    // List
    list: $ => choice(
      seq('[', ']'),
      seq('[', sep1(field('element', $.type_expr), ','), prec.right(PRECEDENCE.syntactic.tail, optional(seq('|', field("tail", $.identifier)))), ']')
    ),

    // Variant
    variant: $ => prec.right(PRECEDENCE.syntactic.tag, seq('|', sep1(field('variant', $.tagged), '|'))),

    // Tagged
    tagged: $ => prec.right(PRECEDENCE.syntactic.tag, seq('#', field('tag', $.identifier), field('payload', $.expr))),

    // Dict
    dict: $ => prec.right(PRECEDENCE.syntactic.base, seq('{', '[', field('index', $.expr), ']', ':', field('type', $.type_expr), '}')),

    // Projection
    projection: $ => choice(
      prec.left(PRECEDENCE.syntactic.projection, seq(field('record', $.atom), '.', field('key', $.identifier))),
      seq('.', field('key', $.identifier))
    ),

    // Injection
    injection: $ => choice(
      prec.right(PRECEDENCE.syntactic.injection, seq('{', field('record', $.expr), '|', sep1(field('updates', $.assignment), ','), '}')),
      prec.right(PRECEDENCE.syntactic.injection, seq('{', '|', sep1(field('updates', $.assignment), ','), '}'))
    ),

    assignment: $ => seq(field('key', $.identifier), '=', field('value', $.type_expr)),

    // Block
    block: $ => choice(
      seq('{', repeat(seq(field('statement', $.statement), ';')), optional(field('return', $.return_statement)), '}'),
      seq('{', field('return', $.return_statement), '}')
    ),

    return_statement: $ => seq('return', field('value', $.type_expr), ';'),

    // Pattern matching
    match: $ => prec.right(PRECEDENCE.syntactic.base, seq('match', field('subject', $.expr), repeat1(field('branch', $.alternative)))),

    alternative: $ => prec.right(PRECEDENCE.syntactic.base, seq('|', field('pattern', $.pattern), '->', field('body', $.expr))),

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
      seq('{', optional(field('tail', seq('|', $.identifier))),'}'),
      seq('{', field('field', sep1($.pattern_key_value, ',')), prec.right(PRECEDENCE.syntactic.base, optional(field('tail', seq('|', $.identifier)))), '}')
    ),

    pattern_tuple: $ => seq('{', field('element', sep1($.pattern, ',')), prec.right(PRECEDENCE.syntactic.base, optional(field('tail', seq('|', $.identifier)))), '}'),

    pattern_list: $ => choice(
      seq('[', ']'),
      seq('[', field('element', sep1($.pattern, ',')), prec.right(PRECEDENCE.syntactic.base, optional(field('tail', seq('|', $.identifier)))), ']')
    ),

    pattern_row: $ => seq('[', field('field', commaSep($.pattern_key_value)), prec.right(PRECEDENCE.syntactic.base, optional(field('tail', seq('|', $.identifier)))), ']'),

    pattern_key_value: $ => seq(field('key', $.identifier), ':', field('pattern', $.pattern)),

    wildcard: $ => '_',

    // Delimited continuations (right-associative)
    reset: $ => prec.right(PRECEDENCE.control.continuations, seq('reset', field('body', $.expr))),

    shift: $ => prec.right(PRECEDENCE.control.continuations, seq('shift', field('body', $.expr))),

    resume: $ => prec.right(PRECEDENCE.control.continuations, seq('resume', field('body', $.expr))),
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
/**
 * 
 * @param {Rule} rule 
 * @returns {SeqRule}
 */
function buildDomain(rule) {
  return sep1(rule, ',');
}
