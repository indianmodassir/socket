/**
 * printf, sprint, vsprint JavaScript Libaray v1.0.0
 * This lightweight JavaScript library implements C-style `printf` functionality.
 * https://github.com/jqrony
 * 
 * @license MIT License
 * @author Indian Modassir
 * 
 * Date: 02 June 2025 08:27 GMT+05030
 */
(function(global) {

// Catches errors and disallows unsafe actions
"use strict";

// Constants
var SAFE_INT = Number.MAX_SAFE_INTEGER;
var MAX_DECIMAL = 53;

var arr = [];
var concat = arr.concat;
var slice = arr.slice;
var Console = console;
var methods = {printf, sprint, vsprint};

/**
 * Regex captures format string segments like:
 * %2$08.2f — meaning: 2nd arg, zero-padded, width 8, precision 2, float.
 *
 * %[argument][padding][flags][width][.precision][length]specifier
 * 
 * - Groups:
 * * (capture 1) Argument   Refers to the specific argument position
 * * (capture 2) Padding    (e.g., 0, (space), 'char)
 * * (capture 3) Flags      (e.g., +, -)
 * * (capture 4) Width      Minimum number of characters
 * * (capture 5) .Precision Decimal places (for floats) or max chars (for strings)
 * * (capture 6) Specifier  (e.g.,  %d, %f, %s) etc.
 */
var rspecifier = /(?<!%)%(?:(\d+\$|)((?:[0\x20])?(?:\'.)?|)([+-]|)(\d+|)(\.\d+|)([a-z]))/gi;
var rpercent = /%/;

/**
 * Each specifier function formats the value and returns it as a string.
 * Specifier keys:
 * - Integer d, u, c, o, X, x, b
 * - Float   f, F, g, G, E, e
 * - String  s
 */
var specifiers = {
  /* INTEGER */
  // Binary integer
  b: function(value, padding, flag, width) {
    return numWith(value.toString(2), padding, flag, width);
  },
  
  // ASCII character from int
  c: function(value, padding, flag, width) {
    value = value < 0 ? "" : value;
    return numWith(String.fromCharCode(value), padding, flag, width);
  },

  // Decimal integer
  d: function(value, padding, flag, width) {
    return numWith(value, padding, flag, width);
  },

  // Octal format or Unsigned 64-bit
  o: function(value, padding, flag, width) {
    // 2^64 + (-210)
    var us64 = (BigInt(1) << BigInt(64)) + BigInt(value);
    value = (value < 0 ? us64 : value).toString(8);
    return numWith(value, padding, flag, width);
  },

  // Unsigned decimal integer
  u: function(value, padding, flag, width) {
    value = parseInt(value) || 0;
    value = ((BigInt(value) + 2n ** 64n) % (2n ** 64n)).toString();
    return numWith(value, padding, flag, width);
  },

  // Hexadecimal lowercase
  x: function(value, padding, flag, width) {
    // 2^64 + (-210)
    var us64 = (BigInt(1) << BigInt(64)) + BigInt(value);
    value = (value < 0 ? us64 : value).toString(16);
    return numWith(value, padding, flag, width);
  },

  // Hexadecimal uppercase
  X: function(value, padding, flag, width) {
    return this.x(value, padding, flag, width).toUpperCase();
  },

  /* FLOAT */
  // Scientific notation lowercase
  e: function(value, padding, flag, width, precision, origVal) {
    value = value.toExponential(precision);
    return numWith(InfNaN(origVal, value), padding, flag, width);
  },

  // Scientific notation uppercase
  E: function(value, padding, flag, width, precision, origVal) {
    return this.e(value, padding, flag, width, precision, origVal).toUpperCase();
  },

  // Fixed-point notation (locale-aware)
  f: function(value, padding, flag, width, precision, origVal) {
    value = value.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: false
    });

    return numWith(InfNaN(origVal, value), padding, flag, width);
  },

  // Fixed-point (non-locale, forced digits)
  F: function(value, padding, flag, width, precision, origVal) {
    value = value.toFixed(precision);
    return numWith(InfNaN(origVal, value), padding, flag, width);
  },

  // Auto scientific or fixed-point format
  g: function(value, padding, flag, width, precision, origVal) {
    var X, formatted,
      regNoFloat = /(\.|0)+$/,

      // Get exponent X
      strExp = this.e(value, "", "", null, precision),
      regExp = /e([+-]?\d+)/;

    // Exponent
    X = +(regExp.exec(strExp) || [])[1];

    // If P > X ≥ -4
    // then use fixed-point style (%f) with precision = P - (X + 1)
    if ((precision > X) && (X >= -4)) {
      formatted = this.f(value, "", "", null, Math.max(precision - (X + 1), 0), origVal);

    // Otherwise,
    // use scientific style (%e) with precision = P - 1
    } else {
      formatted = this.e(value, "", "", null, Math.max(precision - 1, 0), origVal);
    }

    // remove trailing zeros in float
    value = precision <= 16 ? formatted.replace(regNoFloat, "") : formatted;
    return this.s(value, padding, flag, width);
  },

  // Uppercase version of g
  G: function(value, padding, flag, width, precision, origVal) {
    return this.g(value, padding, flag, width, precision, origVal).toUpperCase();
  },

  /* STRING */
  // String format
  s: function(value, padding, flag, width, precision) {
    return strWith(value, padding, flag, width, precision);
  },

  // Uppercase string
  S: function(value, padding, flag, width, precision) {
    return this.s(value, padding, flag, width, precision).toUpperCase();
  }
};

/**
 * Replaces values that are NaN or Infinity with their string equivalents
 * @param {number} value value The original value to test
 * @param {number} force force The string replacement if NaN or Infinity
 * @returns {number|string} The original value or replacement string
 */
function InfNaN(value, force) {
  return Number.isNaN(value) || Math.abs(value) === Infinity ?
    value :
      force;
}

/**
 * Format a string value with padding and precision
 * @param {string} value     The string value to format
 * @param {string} padding   Padding character
 * @param {string} flag      Alignment flag
 * @param {number} width     Minimum width of the result string
 * @param {number} precision Max number of characters from the string to use
 * @returns {string} The formatted string with padding applied
 */
function strWith(value, padding, flag, width, precision) {
  value = value.slice(0, precision) || value;
  return setPadding(value, padding, flag, width);
}

/**
 * Format a numeric value with padding
 * @param {number} value   The string value to format
 * @param {string} padding Padding character
 * @param {string} flag    Alignment flag
 * @param {number} width   Minimum width of the result string
 * @returns {string} The formatted string.
 */
function numWith(value, padding, flag, width) {
  return setPadding(value + "", padding, flag, width, true);
}

/**
 * Pads a value with a specified character to reach a desired width.
 * Pads left or right based on the flag, useful for formatted output.
 *
 * @param {string|number} value - The value to pad.
 * @param {string} padding - Padding character(s). Single quotes are removed if present.
 * @param {string} flag - If "-", left-align (pad right); else right-align (pad left).
 * @param {number} width - Total width after padding.
 * @param {boolean} isNumeric - True if the value is numeric; applies special formatting.
 * @returns {string} The padded string.
 *
 * @throws {RangeError} If padding width exceeds the safe integer limit (SAFE_INT).
 */
function setPadding(value, padding, flag, width, isNumeric) {
  // Remove leading single quote from padding character if present
  padding = padding.replace(/^'/g, "") || "\x20";

  // Calculate the number of padding characters needed
  width = +width - value.length;

  // Check if the required padding width exceeds a safe integer threshold
  if (width > SAFE_INT) {
    throw new RangeError("The width value you entered exceeds this limit:" + width);
  }

  // Apply padding if necessary
  if (width > 0) {
    padding = padding.repeat(width);

    // Apply the padding based on the flag and value type
    value = flag === "-" ? value + padding : (isNumeric && (value = flag + value), padding + value);
  } else if (isNumeric) {
    value = flag + value;
  }

  return value;
}

/**
 * Returns a function to handle each format specifier match from regex replacement.
 * This function extracts the necessary formatting parameters and applies the specifier.
 * 
 * @param {Array} values values The values to substitute into the format string
 * @param {number} i The current index of substitution
 * @returns {Function} A function to format the matched placeholder
 */
function formatHandle(values, i) {
  return function() {
    var value, precision, args = arguments,
      regFloatSpec = /^(f|F|g|G|E|e)$/,
      specifier = args[6],
      fn = specifiers[specifier],
      regStrSpec = /^s$/i,
      arg = args[1];

    // Extract padding, flag, width, precision from match groups
    args = slice.call(arguments, 2, -3);

    if (!fn) {
      throw new Error("ValueError: Unknown format specifier \"" + specifier + "\"");
    }

    value = values[i];
    precision = args[3] ? +args[3].slice(1) : 0;
    args[3] = regFloatSpec.test(specifier) && !args[3] ? 6 : precision;

    if (precision > MAX_DECIMAL) {
      throw new Error("Requested precision of " + precision + " digits was truncated to JS maximum of " + MAX_DECIMAL  + " digits");
    }

    if (arg) {
      value = values[parseInt(arg) - 1];
    }

    // Add original value as last arg
    args.push(value);

    // Add first arg: parsed number or string depending on specifier type
    args.unshift(regStrSpec.test(specifier) ?
      value + "" :
      (regFloatSpec.test(specifier) ? parseFloat(value) : parseInt(value)) || 0
    );
    i++;

    return fn.apply(specifiers, args);
  };
}

/**
 * @internal
 * This function mimics the behavior of C's `sprintf` and formats a string
 * according to a given format string, replacing placeholders with provided values.
 * It returns the formatted string.
 * 
 * @param {string}        format [required]
 * @param {string|number} values [optional]
 * @returns {string} Return a formatted string
 */
function formatNow(format, values) {
  var i = 0, matches = (format.match(rspecifier) || []),
    rswap = /(\d+)(?=\$)/g,
    sl = matches.length, // specifier length
    vl = values.length;  // value length

  if ((matches = format.match(rswap))) {
    sl = Math.max.apply(null, matches || []);
  }

  if (sl > vl) {
    throw new Error("ArgumentCountError: " + sl + " argument are required, " + vl + " given");
  }

  // TODO: Fix bugs % padding of next version
  return format.replace(rspecifier, formatHandle(values, i))
    .replace(rpercent, "");
}

/**
 * This function mimics the behavior of C's `sprintf` and formats a string
 * according to a given format string, replacing placeholders with provided values.
 * It not returns the any formatted string.
 * 
 * @param {string}        format [required]
 * @param {string|number} values [optional]
 * @returns {string} Return a formatted string
 */
function printf(format, values) {
  Console.log(formatNow(format, slice.call(arguments, 1)));
}

/**
 * This function mimics the behavior of C's `sprintf` and formats a string
 * according to a given format string, replacing placeholders with provided values.
 * It returns the formatted string.
 * 
 * @param {string}        format [required]
 * @param {string|number} values [optional]
 * @returns {string} Return a formatted string
 */
function sprint(format) {
  return formatNow(format, slice.call(arguments, 1));
}

/**
 * This function mimics the behavior of C's `sprintf` and formats a string
 * according to a given format string, replacing placeholders with provided values.
 * It returns the formatted string.
 * 
 * @param {string} format [required]
 * @param {array}  values [optional]
 * @returns {string} Return a formatted string
 */
function vsprint(format, values) {
  return sprint.apply(this, concat.apply([], format, values));
}


// Register as named AMD module,
// since sprint can be concatenated with other files that may use define
typeof define === 'function' && define.amd ?
  define(function() {
    return sprint;
  // Expose sprint identifiers, Even in AMD and CommonJS for browser emulators
  }) : (
    typeof module === 'object' ?
    Object.assign(module.exports, methods) : Object.assign(global, methods)
  );



return sprint;
})(typeof window !== 'undefined' ? window : this);