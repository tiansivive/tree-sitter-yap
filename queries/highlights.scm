;; Keywords
"let" @keyword
"using" @keyword
"foreign" @keyword
"export" @keyword
"import" @keyword
"match" @keyword
"return" @keyword
"reset" @keyword
"shift" @keyword
"resume" @keyword
"as" @keyword

;; Type keywords
"Type" @type
"Unit" @type
"Row" @type

;; Boolean and special literals
"true" @boolean
"false" @boolean
"!" @constant.builtin


;; Mu and lambda syntax
"μ" @keyword
"\\" @keyword
"=>" @keyword
"->" @keyword

;; Operators (as literal tokens)
"+" @operator
"-" @operator
"*" @operator
"/" @operator
"%" @operator
"==" @operator
"!=" @operator
"<" @operator
">" @operator
"<=" @operator
">=" @operator
"&&" @operator
"||" @operator
"|>" @operator
"<|" @operator
"<>" @operator
"++" @operator

;; Punctuation
"." @punctuation.delimiter
"," @punctuation.delimiter
";" @punctuation.delimiter
":" @punctuation.delimiter
"|" @punctuation.delimiter
"@" @punctuation.delimiter

;; Brackets
"{" @punctuation.bracket
"}" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
"(" @punctuation.bracket
")" @punctuation.bracket
"<" @punctuation.bracket
">" @punctuation.bracket
"[|" @punctuation.bracket
"|]" @punctuation.bracket

;; Tagged constructors
(tagged
  tag: (identifier) @tag)

(pattern_tagged
  tag: (identifier) @tag)

;; Function names (application context)
(application
  function: (variable
    (identifier) @function))

;; Let bindings
(letdec
  name: (identifier) @variable)

;; Lambda parameters
(param
  (identifier) @variable.parameter)

(typed_param
  (identifier) @variable.parameter)

;; Pi/Mu bindings
(pi
  domain: _ @type
  codomain: _ @type)

(mu
  name: (identifier) @variable)

;; Match patterns and arms
(alternative
  pattern: (pattern) @pattern)

(pattern_variable
  (identifier) @variable)

(pattern_tagged
  tag: (identifier) @tag)

;; Identifiers
(identifier) @variable

;; Literals
(string) @string
(number) @number

;; Labels
(label) @label

;; Comments
(comment) @comment

;; Module/import/export
(import
  (string) @string)

(exports
  (identifier) @variable)
