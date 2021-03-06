var arrSlice = Array.prototype.slice;
var hasProp = Object.prototype.hasOwnProperty;

var defaultOptions = {
    collapse: false,
    encode: {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;',
    },
    escape: [],
};

var defaultTags = {
    raw: ['{{','}}'],
    encoded: ['{{{','}}}'],
    section: ['{{#','{{/','}}'],
};

function each(collection, iteratee, thisArg) {
    if (collection) {
        if (typeof collection.length !== 'undefined') {
            for (var i = 0, len = collection.length; i < len; i++) {
                if (iteratee.call(thisArg, collection[i], i, collection) === false) {
                    return;
                }
            }

        } else {
            for (var prop in collection) {
                if (hasProp.call(collection, prop)) {
                    if (iteratee.call(thisArg, collection[prop], prop, collection) === false) {
                        return;
                    }
                }
            }
        }
    }
}

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

function extend() {
    var ret = arguments[0];

    each(arrSlice.call(arguments, 1), function(ext) {
        each(ext, function(val, key) {
            if (typeof val !== 'undefined') {
                ret[key] = val;
            }
        });
    }, this);

    return ret;
}

function toString(value) {
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return '' + value;
}

function getRecordModel(found, index, encodedTagOpen) {
    /** record array looks like this
    [
        0: content
        1: section tag opener
        2: section tag contents
        3: section tag name
        4: tag opener
        5: variable name
        6: content
        ...
    ]
    **/
    var record = {
        cycle: index % 6,
    };
    var val = found[index];

    switch (record.cycle) {
        case 0:
            record.toTemplate = true;
            record.value = val;
            break;
        case 1:
            break;
        case 2:
            record.toTemplate = true;
            record.value = val;
            record.sectionType = found[index + 1];
            break;
        case 3:
            break;
        case 4:
            break;
        case 5:
            record.toTemplate = true;
            record.value = val;
            record.ref = val;
            record.encode = found[index - 1] === encodedTagOpen;
    }

    return record;
}


/**
 * Can be used in two ways:
 *   (1) new Easybars(options).compile(template)(data)
 *   (2) Easybars(template, data, options)
 */
function Easybars() {
    var args = arguments;
    if (this instanceof Easybars) {
        var _options = args[0] || {};
        var options = extend({}, defaultOptions, _options);
        var tags = extend({}, defaultTags, _options.tags);
        var tagOpen = tags.raw[0];
        var tagClose = tags.raw[1];
        var encodedTagOpen = tags.encoded[0];
        var encodedTagClose = tags.encoded[1];
        var sectionTagStart = tags.section[0];
        var sectionTagFinish = tags.section[1];
        var sectionTagClose = tags.section[2];
        var matchOpenTag = '(' + escapeRegExp(encodedTagOpen) + '|' + escapeRegExp(tagOpen) + ')';
        var matchCloseTag = '(?:' + escapeRegExp(encodedTagClose) + '|' + escapeRegExp(tagClose) + ')';
        var specialLogicTag = '(' + escapeRegExp(sectionTagStart) + ')(([\\w]+) .+)' + escapeRegExp(sectionTagFinish) + '\\3' + escapeRegExp(sectionTagClose) + '|';
        var findTags = new RegExp(specialLogicTag + matchOpenTag + '\\s*(@?[\\w\\.]+)\\s*' + matchCloseTag, 'g');

        this.compile = function (templateString) {
            var template = [];
            var sections = [];
            var varRefs = {};

            var found = templateString.split(findTags);

            for (var i = 0, len = found.length; i < len; i++) {
                var record = getRecordModel(found, i, encodedTagOpen);
                var n;

                if (record.toTemplate && record.value) {
                    if (record.cycle === 0) {
                        n = template.push(record.value);
                    } else {
                        if (options.removeUnmatched) {
                            n = template.push('');
                        } else {
                            if (record.cycle === 5) {
                                if (record.encode) {
                                    n = template.push(encodedTagOpen + record.value + encodedTagClose);
                                } else {
                                    n = template.push(tagOpen + record.value + tagClose);
                                }
                            } else {
                                n = template.push(sectionTagStart + record.value + sectionTagFinish + record.sectionType + sectionTagClose);
                            }
                        }
                    }

                    if (record.ref) {
                        if (!Array.isArray(varRefs[record.ref])) {
                            varRefs[record.ref] = [];
                        }
                        varRefs[record.ref].push({
                            index: n - 1,
                            encode: !!record.encode,
                        });
                    }

                    if (record.sectionType) {
                        sections.push({
                            index: n - 1,
                            type: record.sectionType,
                            value: record.value,
                        });
                    }
                }
            }

            function replaceVarsInCollection(collection, vars, keyName, data) {
                if (keyName) {
                    var path = keyName.split('.');
                    var value = data;
                    for (var i = 0, iLen = path.length; i < iLen; i++) {
                        value = value[path[i]];
                    }
                    if (typeof value === 'object') {
                        for (var o in value) {
                            replaceVarsInCollection(collection, vars, keyName + '.' + o, data);
                        }
                    } else {
                        var refs = vars[keyName];
                        if (refs) {
                            for (var j = 0, jLen = refs.length; j < jLen; j++) {
                                var ref = refs[j];
                                if (ref.encode) {
                                    template[ref.index] = escapeChars(encodeChars(toString(value), options.encode), options.escape);
                                } else {
                                    template[ref.index] = escapeChars(toString(value), options.escape);
                                }
                            }
                        } else {
                            // not found in template
                        }
                    }
                }
            }

            function addSectionsToTemplate(section, terms, body, data) {
                var sectionType = section.type;
                var sectionTemplate = [];

                if (sectionType === 'each') {
                    var value = data;
                    var path = terms.pop().split('.');
                    for (var i = 0, len = path.length; i < len; i++) {
                        value = value[path[i]];
                    }
                    if (typeof value === 'object') {
                        for (var x in value) {
                            if (value.hasOwnProperty(x)) {
                                var sectionData = value[x];
                                if (typeof sectionData === 'object') {
                                    sectionData['@key'] = x;
                                } else {
                                    sectionData = {
                                        '@key': x,
                                        '@value': sectionData,
                                    };
                                }
                                var sectionResult = new Easybars(options).compile(body)(sectionData);
                                sectionTemplate.push(sectionResult);
                            }
                        }
                    }

                } else if (sectionType === 'if') {
                    var value = data;
                    var path = terms.pop().split('.');
                    for (var i = 0, len = path.length; i < len; i++) {
                        if(value) value = value[path[i]];
                    }
                    if (value) {
                        var sectionResult = new Easybars(options).compile(body)(data);
                        sectionTemplate.push(sectionResult);
                    }

                } else if (sectionType === 'for') {
                    terms.shift();
                    var sectionData = data[terms[1]] || [];
                    var num = parseInt(terms[0], 10) || sectionData.length || 0;
                    for (var t = 0; t < num; t++) {
                        var sectionDataThis = sectionData[t];
                        var sectionDataThisType = typeof sectionDataThis;
                        if (sectionDataThisType !== 'undefined') {
                            if (sectionDataThisType === 'object') {
                                sectionDataThis['@index'] = t;
                            } else {
                                sectionDataThis = {
                                    '@index': t,
                                    '@value': sectionDataThis,
                                };
                            }
                            var sectionResult = new Easybars(options).compile(body)(sectionDataThis);
                            sectionTemplate.push(sectionResult);
                        }
                    }
                }

                template[section.index] = sectionTemplate.join('');
            }

            return function (data) {
                for (var k in data) {
                    if (data.hasOwnProperty(k)) {
                        replaceVarsInCollection(template, varRefs, k, data);
                    }
                }
                for (var s = 0, sLen = sections.length; s < sLen; s++) {
                    var section = sections[s];
                    var command = section.value.split(sectionTagClose);
                    var commandTerms = command.shift().split(' ');
                    var commandBody = command.join(sectionTagClose);
                    addSectionsToTemplate(section, commandTerms, commandBody, data);
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
