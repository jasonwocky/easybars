var defaultOptions = {
    collapse: false,
    encode: {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
    },
    escape: [],
    tags: {
        raw: ['{{','}}'],
        encoded: ['{{{','}}}'],
    },
};

function encodeChars(str, encode) {
    for (var x in encode) {
        if (encode.hasOwnProperty(x)) {
            str = str.replace(new RegExp('\\' + x, 'g'), encode[x]);
        }
    }
    return str;
}

function escapeChars(str, escape) {
    for (var i = 0, len = escape.length; i < len; i++) {
        str = str.replace(new RegExp('(^|[^\\\\])(' + escape[i] + ')', 'g'), "$1\\$2");
    }
    return str;
}

function escapeRegExp(str) {
    return str.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
}

function toString(value) {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return '' + value;
}


/**
 * Can be used in two ways:
 *   (1) new Easybars(options).compile(template)(data)
 *   (2) Easybars(template, data, options)
 */
function Easybars() {
    var args = arguments;
    if (this instanceof Easybars) {
        var options = Object.assign({}, defaultOptions, args[0]);
        var openTag = '(' + options.tags.encoded[0] + '|' + options.tags.raw[0] + ')';
        var closeTag = '(?:' + options.tags.encoded[1] + '|' + options.tags.raw[1] + ')';
        var findTags = new RegExp(openTag + '\\s*([\\w\\.]+)\\s*' + closeTag, 'g');

        this.compile = function (templateString) {
            var template = [];
            var vars = {};

            var found = templateString.split(findTags);
            for (var i = 0, len = found.length; i < len; i++) {
                var isTagRecord = (i - 1)%3 === 0;
                var isVarRecord = (i + 1)%3 === 0;
                var n;
                if (!isTagRecord) {
                    n = template.push(isVarRecord ? '' : found[i]);
                }
                if (isVarRecord) {
                    vars[found[i]] = {
                        index: n - 1,
                        encode: found[i - 1] === options.tags.encoded[0],
                    };
                }
            }

            function addValuesToTemplate(keyName, data) {
                if (keyName) {
                    var path = keyName.split('.');
                    var value = data;
                    for (var i = 0, len = path.length; i < len; i++) {
                        value = value[path[i]];
                    }
                    if (typeof value === 'object') {
                        for (var o in value) {
                            addValuesToTemplate(keyName + '.' + o, data);
                        }
                    } else {
                        var ref = vars[keyName];
                        if (ref) {
                            if (ref.encode) {
                                template[ref.index] = escapeChars(encodeChars(toString(value), options.encode), options.escape);
                            } else {
                                template[ref.index] = escapeChars(toString(value), options.escape);
                            }
                        } else {
                            // not found in template
                        }
                    }
                }
            }

            return function (data) {
                for (var k in data) {
                    if (data.hasOwnProperty(k)) {
                        addValuesToTemplate(k, data);
                    }
                }
                var output = template.join('');
                return options.collapse ? output.replace(/[\s\t\r\n\f]+/g, ' ') : output;
            };
        };

    } else {
        return new Easybars(args[2]).compile(args[0])(args[1]);
    }
}

module.exports = Easybars;